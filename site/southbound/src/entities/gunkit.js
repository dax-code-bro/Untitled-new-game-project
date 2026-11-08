// The gun kit: every catalogue gun built as its own firearm (the owner: "most of the items were just
// different colors or slightly different versions of other models").
//
// Guns are mostly flat shapes: a receiver, a slide, a stock, a grip, a magazine are each a side profile
// with some thickness. So each part here is a side profile (z forward to the muzzle, y up, metres)
// extruded across with a small bevel, plus turned parts (barrels, tubes, cylinders, scopes). Thirteen
// real-world layouts (polymer striker pistols, 1911-pattern pistols, revolvers, AR-pattern rifles,
// AK-pattern rifles, battle rifles, bullpups, submachine guns, pump/semi-auto/double shotguns, bolt
// rifles, lever-actions, semi-auto hunting rifles, launchers), each with several variants, and each
// gun's own lengths, stock, grip, handguard, magazine, sights and finish from its id. Nothing here is a
// copy of a particular product: the layouts are the generic forms those families share.
//
// kitGun(w) returns { scene, G }: the model (muzzle toward +z) and the same hold description the
// downloaded models use (arsenal.js buildOpenGun), so holding, aiming, reloading and the fittings
// (gunparts.js) work the same.
import * as THREE from 'three';

function hash(s) { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; }
function rng(seed) { let s = seed >>> 0 || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }

// ---- materials (shared)
const MC = new Map();
const mat = (key, c, rough, metal) => { if (!MC.has(key)) MC.set(key, new THREE.MeshStandardMaterial({ color: new THREE.Color(...c), roughness: rough, metalness: metal, name: key })); return MC.get(key); };
const M = {
  blued: () => mat('blued', [0.035, 0.038, 0.045], 0.32, 0.85),
  park: () => mat('park', [0.05, 0.05, 0.048], 0.62, 0.55),
  steel: () => mat('steel', [0.5, 0.5, 0.52], 0.3, 0.95),
  alloy: () => mat('alloy', [0.045, 0.045, 0.05], 0.48, 0.6),
  poly: () => mat('poly', [0.03, 0.03, 0.032], 0.78, 0.05),
  fde: () => mat('fde', [0.43, 0.35, 0.24], 0.75, 0.05),
  od: () => mat('od', [0.2, 0.23, 0.15], 0.75, 0.05),
  grey: () => mat('grey', [0.2, 0.2, 0.21], 0.7, 0.1),
  walnut: () => mat('walnut', [0.24, 0.11, 0.045], 0.5, 0.0),
  maple: () => mat('maple', [0.45, 0.27, 0.12], 0.45, 0.0),
  birch: () => mat('birch', [0.36, 0.17, 0.06], 0.55, 0.0),
  rubber: () => mat('rubber', [0.02, 0.02, 0.02], 0.9, 0.0),
  brass: () => mat('brass', [0.55, 0.42, 0.16], 0.3, 0.95),
  olive: () => mat('olive', [0.17, 0.2, 0.13], 0.7, 0.1),
  dark: () => mat('dark', [0.008, 0.008, 0.009], 0.6, 0.2),
};
const WOODS = ['walnut', 'maple', 'birch'], POLYS = ['poly', 'poly', 'fde', 'od', 'grey'];

// ---- part makers
// a side profile [[z, y], ...] extruded `t` thick across x (centred), bevelled
const _gc = new Map();
function prof(pts, t, m, bevel = 0.0015) {
  const key = pts.map((p) => p[0].toFixed(4) + ',' + p[1].toFixed(4)).join(';') + '|' + t.toFixed(4) + '|' + bevel;
  let g = _gc.get(key);
  if (!g) {
    const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]);
    const b = Math.min(bevel, t * 0.3);
    g = new THREE.ExtrudeGeometry(s, { depth: Math.max(0.001, t - 2 * b), bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 1, curveSegments: 3 });
    g.translate(0, 0, -(t - 2 * b) / 2); g.rotateY(-Math.PI / 2); g.computeVertexNormals();
    _gc.set(key, g);
  }
  return new THREE.Mesh(g, m);
}
// a turned part along +z from z = 0 (r0 at the back, r1 at the front)
function tube(r0, len, m, seg = 16, r1 = r0) { const g = new THREE.CylinderGeometry(r1, r0, len, seg); g.rotateX(Math.PI / 2); g.translate(0, 0, len / 2); return new THREE.Mesh(g, m); }
function boxM(x, y, z, m) { return new THREE.Mesh(new THREE.BoxGeometry(x, y, z), m); }
const at = (g, o, x, y, z, rx = 0, ry = 0, rz = 0) => { o.position.set(x, y, z); o.rotation.set(rx, ry, rz); g.add(o); return o; };
// a rectangle-ish outline with rounded-off corners
const rect = (z0, y0, z1, y1, c = 0.004) => [[z0 + c, y0], [z1 - c, y0], [z1, y0 + c], [z1, y1 - c], [z1 - c, y1], [z0 + c, y1], [z0, y1 - c], [z0, y0 + c]];

// ---- shared sub-assemblies
function pistolGrip(g, r, z, y, h, m, angle = 0.3, w = 0.03, style = 0) {
  // back of the grip at (z, y) going down; angle leans the bottom back
  const d = 0.034 + style * 0.004, lean = h * Math.tan(angle);
  const pts = style === 2
    ? [[z, y], [z + d, y], [z + d - lean * 0.9, y - h * 0.5], [z + d - lean, y - h], [z - lean - 0.004, y - h], [z - lean * 0.6 - 0.012, y - h * 0.55], [z - 0.008, y - 0.01]]
    : [[z, y], [z + d, y], [z + d - lean, y - h], [z - lean - 0.004, y - h + 0.004], [z - 0.004, y - 0.01]];
  at(g, prof(pts, w, m, 0.004), 0, 0, 0);
}
function triggerGuard(g, z, y, len, m, square = false) {
  const t = 0.0045;
  const pts = square ? [[z, y], [z + len, y], [z + len, y - 0.026], [z + len - t, y - 0.026], [z + len - t, y - t], [z + t, y - t], [z + t, y - 0.022], [z, y - 0.022]]
    : [[z, y], [z + len, y], [z + len * 0.95, y - 0.022], [z + len * 0.8, y - 0.028], [z + len * 0.78, y - 0.028 + t], [z + len * 0.92, y - 0.02], [z + len - t, y - t], [z + t, y - t], [z + t, y - 0.012], [z, y - 0.014]];
  at(g, prof(pts, 0.008, m, 0.001), 0, 0, 0);
  at(g, prof([[z + len * 0.42, y], [z + len * 0.5, y], [z + len * 0.46, y - 0.018], [z + len * 0.4, y - 0.016]], 0.004, M.steel(), 0.0005), 0, 0, 0); // trigger
}
function curvedMag(g, z, y, len, w, m, curve = 0.06, thick = 0.024) {
  // a magazine hanging from (z, y): front edge curves forward as it goes down
  const pts = [[z, y], [z + w, y], [z + w + curve * 0.4, y - len * 0.5], [z + w + curve, y - len], [z + curve, y - len - 0.004], [z + curve * 0.4 - 0.003, y - len * 0.5]];
  at(g, prof(pts, thick, m, 0.002), 0, 0, 0);
}
function straightMag(g, z, y, len, w, m, rake = 0.01, thick = 0.024) {
  at(g, prof([[z, y], [z + w, y], [z + w + rake, y - len], [z + rake - 0.003, y - len - 0.003]], thick, m, 0.002), 0, 0, 0);
}
function frontPost(g, z, y, m, tall = 0.03) { at(g, prof([[z, y], [z + 0.03, y], [z + 0.022, y + tall], [z + 0.008, y + tall]], 0.016, m, 0.001), 0, 0, 0); }
function railTop(g, z0, z1, y, m) { at(g, boxM(0.021, 0.008, z1 - z0, m), 0, y + 0.004, (z0 + z1) / 2); for (let z = z0 + 0.006; z < z1 - 0.004; z += 0.01) at(g, boxM(0.023, 0.004, 0.005, m), 0, y + 0.009, z); }

// =============================================================== families
// each returns { g, a } where a holds anchor points (grip, fore, well, bolt, sight, muzzle) in metres

function striker(r, k) {
  // polymer-frame striker pistol (service / compact / machine)
  const g = new THREE.Group(), compact = k === 'compact', machine = k === 'machine';
  const Ls = (compact ? 0.155 : 0.18) + r() * 0.03, sh = 0.029 + r() * 0.005, sw = 0.024 + r() * 0.004;
  const frameM = M[POLYS[Math.floor(r() * POLYS.length)]](), slideM = r() < 0.2 ? M.steel() : r() < 0.5 ? M.park() : M.blued();
  const gh = (compact ? 0.08 : 0.095) + r() * 0.015, ang = 0.28 + r() * 0.12, y0 = 0.1;
  const front = r(); // slide nose: bevelled, rounded, flat
  const nose = front < 0.33 ? [[Ls, y0 + 0.004], [Ls, y0 + sh - 0.009], [Ls - 0.008, y0 + sh]] : front < 0.66 ? [[Ls, y0 + 0.004], [Ls - 0.002, y0 + sh - 0.004], [Ls - 0.006, y0 + sh]] : [[Ls, y0 + 0.004], [Ls, y0 + sh]];
  at(g, prof([[0, y0], [Ls - 0.004, y0], ...nose, [0.006, y0 + sh], [0, y0 + sh - 0.006]], sw, slideM, 0.002), 0, 0, 0);
  // serrations, ejection port, lightening cuts
  for (let i = 0; i < 6; i++) at(g, boxM(sw + 0.001, sh * 0.7, 0.0018, M.dark()), 0, y0 + sh * 0.48, 0.012 + i * 0.0045);
  if (r() < 0.5) for (let i = 0; i < 5; i++) at(g, boxM(sw + 0.001, sh * 0.6, 0.0018, M.dark()), 0, y0 + sh * 0.5, Ls - 0.035 + i * 0.0045);
  at(g, boxM(sw * 0.62, 0.003, 0.034, M.dark()), sw * 0.12, y0 + sh + 0.0005, Ls * 0.52);
  if (r() < 0.3) for (let i = 0; i < 3; i++) at(g, boxM(sw * 0.5, 0.003, 0.014, M.dark()), 0, y0 + sh + 0.0005, Ls * 0.62 + i * 0.019);
  // frame: dust cover (maybe railed), grip, trigger guard
  const fz = Ls * 0.92;
  at(g, prof([[0.004, y0 + 0.002], [fz, y0 + 0.002], [fz, y0 - 0.014], [Ls * 0.42, y0 - 0.018], [0.03, y0 - 0.016], [0.004, y0 - 0.006]], sw - 0.002, frameM, 0.002), 0, 0, 0);
  if (r() < 0.6) for (let i = 0; i < 3; i++) at(g, boxM(sw - 0.004, 0.003, 0.004, M.dark()), 0, y0 - 0.016, fz - 0.012 - i * 0.01);
  pistolGrip(g, r, 0.002, y0 - 0.004, gh, frameM, ang, sw + 0.002, r() < 0.4 ? 2 : 0);
  triggerGuard(g, Ls * 0.32, y0 - 0.016, 0.05, frameM, r() < 0.5);
  // magazine base (longer on the machine pistol)
  const ml = machine ? 0.06 + r() * 0.05 : 0.008;
  const bz = -gh * Math.tan(ang) + 0.004;
  straightMag(g, bz, y0 - gh + 0.004, ml, 0.034, machine ? M.poly() : frameM, -0.008, sw - 0.003);
  // barrel at the muzzle, sights
  at(g, tube(0.0065, 0.012, M.blued(), 12), 0, y0 + sh * 0.58, Ls - 0.008);
  at(g, boxM(0.004, 0.006, 0.006, M.dark()), 0, y0 + sh + 0.003, Ls - 0.012);
  at(g, boxM(0.018, 0.007, 0.008, M.dark()), 0, y0 + sh + 0.0035, 0.01);
  if (machine) at(g, prof([[Ls - 0.002, y0 + 0.004], [Ls + 0.026, y0 + 0.004], [Ls + 0.026, y0 + sh - 0.004], [Ls - 0.002, y0 + sh - 0.004]], sw - 0.002, M.park(), 0.002), 0, 0, 0);
  return { g, a: { grip: [0.02, y0 - 0.04], fore: [Ls * 0.4, y0 - 0.05], well: [bz + 0.016, y0 - gh], bolt: [0.02, y0 + sh], sight: [0.02, y0 + sh + 0.006], muzzle: [Ls + (machine ? 0.026 : 0), y0 + sh * 0.58] }, kind: 'pistol' };
}

function nineteen11(r) {
  // all-steel single-action pistol: flat slide, grip safety, hammer, wood or rubber panels; long-slide target version
  const g = new THREE.Group();
  const Ls = 0.15 + r() * 0.09, sh = 0.026 + r() * 0.005, sw = 0.022 + r() * 0.003, y0 = 0.1, ang = 0.2 + r() * 0.06, gh = 0.088 + r() * 0.026;
  const frameSteel = r() < 0.45 ? M.steel() : M.blued(), steel = r() < 0.3 ? (frameSteel === M.steel() ? M.blued() : M.steel()) : frameSteel; // sometimes two-tone
  const panels = r() < 0.6 ? M[WOODS[Math.floor(r() * 3)]]() : M.rubber();
  at(g, prof([[0, y0], [Ls, y0], [Ls, y0 + sh], [0.004, y0 + sh], [0, y0 + sh - 0.004]], sw, steel, 0.0015), 0, 0, 0);
  if (r() < 0.5) for (let i = 0; i < 6; i++) at(g, boxM(sw + 0.001, sh * 0.6, 0.0016, M.dark()), 0, y0 + sh * 0.45, Ls - 0.032 + i * 0.004); // front serrations
  if (r() < 0.25) for (let i = 0; i < 3; i++) at(g, boxM(sw + 0.001, sh * 0.35, 0.012, M.dark()), 0, y0 + sh * 0.55, Ls * 0.55 + i * 0.016); // lightening cuts
  if (r() < 0.4) for (let i = 0; i < 3; i++) at(g, boxM(sw - 0.004, 0.003, 0.004, M.dark()), 0, y0 - 0.014, Ls * 0.5 + i * 0.012); // a rail under the dust cover
  const comp = r() < 0.18 ? 0.022 + r() * 0.012 : 0;
  if (comp) at(g, prof(rect(Ls, y0 + 0.002, Ls + comp, y0 + sh - 0.002, 0.003), sw - 0.002, frameSteel, 0.002), 0, 0, 0);
  for (let i = 0; i < 8; i++) at(g, boxM(sw + 0.001, sh * 0.65, 0.0016, M.dark()), 0, y0 + sh * 0.45, 0.01 + i * 0.004);
  at(g, boxM(sw * 0.6, 0.003, 0.03, M.dark()), sw * 0.12, y0 + sh + 0.0005, Ls * 0.45);
  at(g, tube(0.008, 0.006, steel, 14), 0, y0 + sh * 0.55, Ls - 0.001); // barrel bushing
  at(g, prof([[0.0, y0 + 0.002], [Ls * 0.62, y0 + 0.002], [Ls * 0.62, y0 - 0.012], [0.02, y0 - 0.014]], sw - 0.002, frameSteel, 0.0015), 0, 0, 0);
  pistolGrip(g, r, 0.0, y0 - 0.002, gh, frameSteel, ang, sw, 0);
  at(g, prof([[0.004, y0 - 0.025], [0.034, y0 - 0.025], [0.034 - (gh - 0.035) * Math.tan(ang), y0 - gh + 0.01], [0.004 - (gh - 0.035) * Math.tan(ang), y0 - gh + 0.01]], sw + 0.004, panels, 0.002), 0, 0, 0);
  if (r() < 0.3) at(g, prof(rect(-gh * Math.tan(ang) - 0.004, y0 - gh - 0.012, -gh * Math.tan(ang) + 0.036, y0 - gh + 0.002, 0.003), sw + 0.006, M.alloy(), 0.002), 0, 0, 0); // flared magwell
  at(g, prof([[-0.014, y0 + 0.004], [0.004, y0 + 0.004], [0.004, y0 - 0.012], [-0.01, y0 - 0.006]], sw - 0.006, steel, 0.001), 0, 0, 0); // grip safety tang
  at(g, prof([[-0.006, y0 + sh - 0.006], [0.004, y0 + sh - 0.004], [0.004, y0 + sh - 0.016], [-0.004, y0 + sh - 0.016]], 0.008, steel, 0.001), 0, 0, 0); // hammer
  triggerGuard(g, Ls * 0.28, y0 - 0.012, 0.046, steel, r() < 0.5);
  at(g, boxM(0.004, 0.006, 0.006, M.dark()), 0, y0 + sh + 0.003, Ls - 0.01);
  at(g, boxM(0.018, 0.007, 0.008, M.dark()), 0, y0 + sh + 0.0035, 0.012);
  return { g, a: { grip: [0.018, y0 - 0.04], fore: [Ls * 0.35, y0 - 0.05], well: [0.0, y0 - gh], bolt: [0.02, y0 + sh], sight: [0.02, y0 + sh + 0.006], muzzle: [Ls + 0.005 + comp, y0 + sh * 0.55] }, kind: 'pistol' };
}

function revolver(r) {
  const g = new THREE.Group();
  const bl = 0.065 + r() * 0.14, y0 = 0.1, steel = r() < 0.4 ? M.steel() : M.blued(), grip = r() < 0.6 ? M[WOODS[Math.floor(r() * 3)]]() : M.rubber();
  const cz = 0.035, cl = 0.042, cr = 0.019 + r() * 0.004;
  // frame: top strap over the cylinder window, back strap down into the grip
  at(g, prof([[0, y0 - 0.006], [cz + cl + 0.012, y0 - 0.006], [cz + cl + 0.012, y0 + 0.03], [cz + cl, y0 + 0.034], [cz, y0 + 0.034], [0.004, y0 + 0.026], [0, y0 + 0.012]], 0.02, steel, 0.0015), 0, 0, 0);
  at(g, boxM(0.022, 0.03, cl + 0.002, M.dark()), 0, y0 + 0.012, cz + cl / 2); // the window
  const cyl = at(g, tube(cr, cl, steel, 18), 0, y0 + 0.012, cz);
  if (r() < 0.75) for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; at(g, boxM(0.004, 0.004, cl * 0.62, M.dark()), Math.cos(a) * cr * 0.98, y0 + 0.012 + Math.sin(a) * cr * 0.98, cz + cl / 2); }
  void cyl;
  // barrel, with a full, half or no underlug, and a rib on top
  at(g, tube(0.0085, bl, steel, 14), 0, y0 + 0.024, cz + cl + 0.01);
  const lug = r(); if (lug < 0.7) at(g, prof([[cz + cl + 0.01, y0 + 0.004], [cz + cl + 0.01 + bl * (lug < 0.4 ? 1 : 0.45), y0 + 0.004], [cz + cl + 0.01 + bl * (lug < 0.4 ? 1 : 0.45), y0 + 0.022], [cz + cl + 0.01, y0 + 0.022]], 0.013, steel, 0.0015), 0, 0, 0);
  if (r() < 0.6) at(g, boxM(0.006, 0.006, bl, steel), 0, y0 + 0.034, cz + cl + 0.01 + bl / 2);
  at(g, tube(0.0028, bl * 0.55, steel, 8), 0, y0 + 0.006, cz + cl + 0.01); // ejector rod
  at(g, prof([[-0.004, y0 + 0.028], [0.008, y0 + 0.03], [0.006, y0 + 0.016], [-0.006, y0 + 0.018]], 0.008, steel, 0.001), 0, 0, 0); // hammer
  const round = r() < 0.5;
  at(g, prof(round ? [[0.0, y0 - 0.004], [0.03, y0 - 0.004], [0.022, y0 - 0.06], [0.006, y0 - 0.088], [-0.014, y0 - 0.084], [-0.012, y0 - 0.04]] : [[0.0, y0 - 0.004], [0.03, y0 - 0.004], [0.02, y0 - 0.1], [-0.02, y0 - 0.1], [-0.012, y0 - 0.03]], 0.032, grip, 0.004), 0, 0, 0);
  triggerGuard(g, 0.026, y0 - 0.006, 0.038, steel, false);
  frontPost(g, cz + cl + bl - 0.006, y0 + 0.032, steel, 0.008);
  return { g, a: { grip: [0.006, y0 - 0.035], fore: [0.04, y0 - 0.05], well: [cz + cl / 2, y0 + 0.012], bolt: [0.0, y0 + 0.03], sight: [0.01, y0 + 0.036], muzzle: [cz + cl + 0.01 + bl, y0 + 0.024] }, kind: 'pistol', revolver: true };
}

// ---- long guns: stocks and grips shared by several families
function stock(g, r, type, z, y, m, len = 0.3) {
  // the stock's front top at (z, y), extending back to z - len
  if (type === 'tube') { // collapsible on a buffer tube
    at(g, tube(0.016, len * 0.85, M.alloy(), 14), 0, y - 0.012, z - len * 0.85);
    at(g, prof([[z - len, y + 0.004], [z - len * 0.55, y + 0.004], [z - len * 0.55, y - 0.03], [z - len * 0.75, y - 0.07], [z - len, y - 0.085]], 0.04, m, 0.004), 0, 0, 0);
  } else if (type === 'skeleton') {
    at(g, prof([[z, y], [z - len, y - 0.01], [z - len, y - 0.1], [z - len + 0.02, y - 0.1], [z - len + 0.02, y - 0.03], [z, y - 0.02]], 0.022, m, 0.003), 0, 0, 0);
    at(g, prof([[z - len * 0.4, y - 0.025], [z - len + 0.02, y - 0.09], [z - len + 0.02, y - 0.1], [z - len * 0.4, y - 0.04]], 0.018, m, 0.002), 0, 0, 0);
  } else if (type === 'folder') { // a folded-flat steel wire stock alongside
    at(g, prof([[z, y], [z - len, y - 0.02], [z - len, y - 0.06], [z - len + 0.012, y - 0.06], [z - len + 0.012, y - 0.03], [z, y - 0.012]], 0.012, M.park(), 0.002), 0, 0, 0);
  } else if (type === 'precision') {
    at(g, prof([[z, y], [z - len, y], [z - len, y - 0.12], [z - len + 0.03, y - 0.12], [z - len + 0.05, y - 0.06], [z - len * 0.35, y - 0.05], [z, y - 0.045]], 0.038, m, 0.004), 0, 0, 0);
    at(g, boxM(0.03, 0.025, 0.08, M.rubber()), 0, y + 0.012, z - len * 0.75); // cheek riser
  } else if (type === 'thumbhole') {
    at(g, prof([[z, y], [z - len, y + 0.01], [z - len, y - 0.13], [z - len * 0.6, y - 0.08], [z - len * 0.25, y - 0.1], [z, y - 0.05]], 0.04, m, 0.005), 0, 0, 0);
    at(g, boxM(0.042, 0.03, 0.05, M.dark()), 0, y - 0.05, z - len * 0.22);
  } else { // 'sporter' / 'fixed': a traditional butt stock, comb dropping to the heel
    const drop = type === 'sporter' ? 0.05 : 0.03, toe = type === 'sporter' ? 0.14 : 0.12;
    at(g, prof([[z, y], [z - len, y - drop * 0.6], [z - len - 0.004, y - drop - toe], [z - len * 0.5, y - toe * 0.75], [z, y - 0.055]], 0.04, m, 0.005), 0, 0, 0);
    at(g, prof([[z - len - 0.016, y - drop * 0.6 + 0.004], [z - len, y - drop * 0.6 + 0.004], [z - len - 0.004, y - drop - toe - 0.002], [z - len - 0.018, y - drop - toe - 0.002]], 0.042, M.rubber(), 0.003), 0, 0, 0);
  }
}

function arPattern(r, k) {
  // AR-pattern rifle/carbine/DMR: upper + lower, buffer tube, handguard, curved 5.56 or straight 7.62 mag
  const g = new THREE.Group(), dmr = k === 'dmr' || k === 'battle';
  const furn = M[r() < 0.6 ? 'poly' : POLYS[Math.floor(r() * POLYS.length)]](), y0 = 0.18;
  const zR = 0.32, rl = dmr ? 0.21 : 0.19; // receiver from zR to zR + rl
  const hgL = (dmr ? 0.3 : 0.2) + r() * 0.17, bl = hgL + 0.05 + r() * (dmr ? 0.16 : 0.1);
  // upper: flat-top rail or carry handle
  at(g, prof(rect(zR, y0, zR + rl, y0 + 0.04, 0.004), 0.03, M.alloy(), 0.002), 0, 0, 0);
  if (r() < 0.25) { at(g, prof([[zR + 0.02, y0 + 0.04], [zR + 0.12, y0 + 0.04], [zR + 0.12, y0 + 0.075], [zR + 0.03, y0 + 0.075]], 0.016, M.alloy(), 0.002), 0, 0, 0); }
  else railTop(g, zR + 0.004, zR + rl - 0.004, y0 + 0.04, M.alloy());
  at(g, boxM(0.032, 0.012, 0.03, M.dark()), 0.002, y0 + 0.022, zR + rl * 0.55); // ejection port
  // lower with the magwell, grip and trigger guard
  at(g, prof([[zR + 0.004, y0], [zR + rl * 0.75, y0], [zR + rl * 0.75, y0 - 0.034], [zR + rl * 0.5, y0 - 0.05], [zR + rl * 0.3, y0 - 0.05], [zR + rl * 0.2, y0 - 0.026], [zR + 0.004, y0 - 0.024]], 0.032, M.alloy(), 0.002), 0, 0, 0);
  pistolGrip(g, r, zR + 0.01, y0 - 0.024, 0.09, furn, 0.36, 0.03, r() < 0.5 ? 2 : 0);
  triggerGuard(g, zR + 0.05, y0 - 0.026, 0.06, M.alloy(), true);
  if (dmr) straightMag(g, zR + rl * 0.45, y0 - 0.048, 0.085 + r() * 0.04, 0.055, M.dark(), 0.006, 0.028);
  else curvedMag(g, zR + rl * 0.45, y0 - 0.048, 0.15 + r() * 0.04, 0.05, r() < 0.3 ? M.fde() : M.dark(), 0.05, 0.022);
  // handguard: ribbed round, quad rail, or slim slotted
  const hz = zR + rl, hs = r();
  if (hs < 0.33) { at(g, tube(0.024, hgL, furn, 14), 0, y0 + 0.018, hz); for (let z = hz + 0.02; z < hz + hgL - 0.01; z += 0.024) at(g, boxM(0.05, 0.004, 0.008, M.dark()), 0, y0 + 0.018, z); }
  else if (hs < 0.66) { at(g, boxM(0.044, 0.044, hgL, M.alloy()), 0, y0 + 0.018, hz + hgL / 2); for (const sx of [-1, 1]) for (let z = hz + 0.008; z < hz + hgL - 0.006; z += 0.01) at(g, boxM(0.006, 0.02, 0.005, M.alloy()), sx * 0.024, y0 + 0.018, z); railTop(g, hz, hz + hgL, y0 + 0.04, M.alloy()); }
  else { at(g, prof(rect(hz, y0 - 0.004, hz + hgL, y0 + 0.04, 0.008), 0.038, furn, 0.004), 0, 0, 0); for (let z = hz + 0.03; z < hz + hgL - 0.03; z += 0.05) at(g, boxM(0.04, 0.008, 0.026, M.dark()), 0, y0 + 0.016, z); }
  // barrel, front sight
  at(g, tube(dmr ? 0.0105 : 0.0085, bl, M.park(), 14), 0, y0 + 0.018, hz);
  if (r() < 0.45) frontPost(g, hz + hgL + 0.02, y0 + 0.026, M.park(), 0.05);
  // stock
  const st = r(), stype = st < 0.45 ? 'tube' : st < 0.65 ? 'fixed' : st < 0.82 ? 'precision' : 'skeleton';
  stock(g, r, stype, zR + 0.004, y0 + 0.03, furn, zR);
  at(g, prof([[zR + 0.01, y0 + 0.03], [zR + 0.04, y0 + 0.03], [zR + 0.04, y0 + 0.026], [zR + 0.01, y0 + 0.026]], 0.05, M.alloy(), 0.001), 0, 0, 0); // charging handle
  return { g, a: { grip: [zR + 0.0, y0 - 0.06], fore: [hz + hgL * 0.45, y0 + 0.009], well: [zR + rl * 0.5, y0 - 0.1], bolt: [zR + 0.03, y0 + 0.04], sight: [zR + 0.05, y0 + 0.05], muzzle: [hz + bl, y0 + 0.018] }, kind: 'long' };
}

function akPattern(r, k) {
  const g = new THREE.Group(), y0 = 0.17, wood = r() < 0.55;
  const furn = wood ? M[WOODS[Math.floor(r() * 3)]]() : M[POLYS[Math.floor(r() * POLYS.length)]](), steel = M.park();
  const zR = 0.3, rl = 0.24, bl = 0.33 + r() * 0.12 - (k === 'pdw' ? 0.14 : 0);
  // stamped receiver with the dust cover rounding off at the back
  at(g, prof([[zR, y0 - 0.032], [zR + rl, y0 - 0.032], [zR + rl, y0 + 0.022], [zR + 0.03, y0 + 0.03], [zR, y0 + 0.012]], 0.034, steel, 0.0015), 0, 0, 0);
  at(g, boxM(0.002, 0.012, 0.09, M.dark()), 0.0175, y0 + 0.004, zR + rl * 0.5); // the long selector lever
  // gas tube over a wooden/polymer handguard
  const hz = zR + rl, hgL = 0.16 + r() * 0.05;
  at(g, prof(rect(hz, y0 - 0.03, hz + hgL, y0 + 0.012, 0.01), 0.044, furn, 0.004), 0, 0, 0);
  at(g, prof(rect(hz + 0.01, y0 + 0.014, hz + hgL + 0.02, y0 + 0.036, 0.008), 0.03, r() < 0.5 ? furn : steel, 0.003), 0, 0, 0);
  at(g, tube(0.0085, bl, steel, 14), 0, y0, hz);
  at(g, prof([[hz + bl - 0.08, y0 - 0.01], [hz + bl - 0.05, y0 - 0.01], [hz + bl - 0.052, y0 + 0.045], [hz + bl - 0.074, y0 + 0.04]], 0.016, steel, 0.0015), 0, 0, 0); // front sight block
  at(g, prof([[hz - 0.04, y0 + 0.03], [hz + 0.02, y0 + 0.03], [hz + 0.02, y0 + 0.04], [hz - 0.04, y0 + 0.036]], 0.022, steel, 0.0015), 0, 0, 0); // rear sight
  pistolGrip(g, r, zR + 0.005, y0 - 0.032, 0.085, wood && r() < 0.5 ? furn : M.poly(), 0.42, 0.03, 0);
  triggerGuard(g, zR + 0.035, y0 - 0.032, 0.062, steel, true);
  curvedMag(g, zR + rl * 0.48, y0 - 0.032, 0.16 + r() * 0.03, 0.05, r() < 0.4 ? M.olive() : M.park(), 0.075, 0.024);
  const st = r(), stype = st < 0.5 ? 'fixed' : st < 0.75 ? 'folder' : 'skeleton';
  stock(g, r, stype, zR, y0 + 0.012, furn, 0.27);
  return { g, a: { grip: [zR - 0.005, y0 - 0.065], fore: [hz + hgL * 0.5, y0 - 0.015], well: [zR + rl * 0.5, y0 - 0.1], bolt: [zR + rl * 0.65, y0 + 0.01], sight: [hz - 0.01, y0 + 0.042], muzzle: [hz + bl, y0] }, kind: 'long' };
}

function battle(r) {
  // full-power battle rifle: long receiver, straight 20-round mag, either a carry handle and wood/poly
  // furniture, or a cocking tube over the barrel and a slim handguard
  const g = new THREE.Group(), y0 = 0.18, style = r() < 0.5 ? 'carry' : 'tube';
  const furn = r() < 0.4 ? M[WOODS[Math.floor(r() * 3)]]() : M[POLYS[Math.floor(r() * POLYS.length)]](), steel = M.park();
  const zR = 0.32, rl = 0.27, bl = 0.42 + r() * 0.1, hgL = 0.22 + r() * 0.06;
  at(g, prof(rect(zR, y0 - 0.035, zR + rl, y0 + 0.032, 0.006), 0.036, steel, 0.002), 0, 0, 0);
  if (style === 'carry') at(g, prof([[zR + 0.08, y0 + 0.032], [zR + 0.2, y0 + 0.032], [zR + 0.19, y0 + 0.062], [zR + 0.09, y0 + 0.062]], 0.014, steel, 0.002), 0, 0, 0);
  else at(g, tube(0.012, bl * 0.8, steel, 12), 0, y0 + 0.04, zR + rl * 0.6);
  at(g, prof(rect(zR + rl, y0 - 0.03, zR + rl + hgL, y0 + 0.025, 0.01), 0.046, furn, 0.004), 0, 0, 0);
  for (let z = zR + rl + 0.03; z < zR + rl + hgL - 0.02; z += 0.035) at(g, boxM(0.048, 0.006, 0.012, M.dark()), 0, y0 + 0.0, z);
  at(g, tube(0.011, bl, steel, 14), 0, y0, zR + rl);
  frontPost(g, zR + rl + bl - 0.05, y0 + 0.008, steel, 0.045);
  pistolGrip(g, r, zR + 0.01, y0 - 0.035, 0.09, furn, 0.3, 0.032, 0);
  triggerGuard(g, zR + 0.045, y0 - 0.035, 0.06, steel, true);
  straightMag(g, zR + rl * 0.42, y0 - 0.035, 0.1 + r() * 0.03, 0.06, M.park(), 0.012, 0.03);
  stock(g, r, r() < 0.7 ? 'fixed' : 'folder', zR, y0 + 0.02, furn, 0.3);
  return { g, a: { grip: [zR, y0 - 0.07], fore: [zR + rl + hgL * 0.45, y0 - 0.015], well: [zR + rl * 0.45, y0 - 0.12], bolt: [zR + rl * 0.5, y0 + 0.03], sight: [zR + 0.1, y0 + (style === 'carry' ? 0.066 : 0.045)], muzzle: [zR + rl + bl, y0] }, kind: 'long' };
}

function bullpup(r) {
  // action behind the trigger: a long one-piece shell, mag behind the grip, butt plate at the back
  const g = new THREE.Group(), y0 = 0.16, shell = M[POLYS[Math.floor(r() * POLYS.length)]]();
  const L = 0.5 + r() * 0.12, style = r();
  const pts = style < 0.33
    ? [[0, y0 - 0.085], [0.03, y0 - 0.095], [L * 0.42, y0 - 0.07], [L * 0.5, y0 - 0.035], [L, y0 - 0.03], [L, y0 + 0.025], [L * 0.45, y0 + 0.03], [0.02, y0 + 0.028], [0, y0 + 0.01]]
    : style < 0.66 ? [[0, y0 - 0.09], [L * 0.4, y0 - 0.09], [L * 0.44, y0 - 0.035], [L, y0 - 0.03], [L, y0 + 0.028], [0, y0 + 0.03]]
      : [[0, y0 - 0.08], [L * 0.38, y0 - 0.08], [L * 0.5, y0 - 0.035], [L * 0.95, y0 - 0.028], [L, y0], [L * 0.95, y0 + 0.03], [0.04, y0 + 0.034], [0, y0 + 0.02]];
  at(g, prof(pts, 0.046, shell, 0.006), 0, 0, 0);
  at(g, prof([[-0.014, pts[0][1] + 0.004], [0.004, pts[0][1] + 0.004], [0.004, y0 + 0.02], [-0.014, y0 + 0.018]], 0.044, M.rubber(), 0.004), 0, 0, 0); // butt pad
  at(g, boxM(0.048, 0.006, L * 0.3, M.dark()), 0, y0 - 0.02, L * 0.2); // the seam where the shell halves meet
  for (let z = L * 0.62; z < L * 0.94; z += 0.035) at(g, boxM(0.048, 0.012, 0.012, M.dark()), 0, y0 - 0.008, z); // vents in the fore-end
  const gz = L * 0.55;
  pistolGrip(g, r, gz, y0 - 0.035, 0.09, shell, 0.25, 0.032, 2);
  at(g, prof([[gz + 0.05, y0 - 0.035], [gz + 0.08, y0 - 0.035], [gz + 0.07, y0 - 0.125], [gz - 0.02, y0 - 0.125], [gz - 0.01, y0 - 0.11], [gz + 0.055, y0 - 0.11]], 0.012, shell, 0.002), 0, 0, 0); // full-hand guard
  curvedMag(g, L * 0.2, y0 - 0.075, 0.12 + r() * 0.03, 0.05, r() < 0.35 ? M.grey() : M.dark(), 0.04, 0.022);
  const bl = 0.06 + r() * 0.08;
  at(g, tube(0.0085, bl + 0.04, M.park(), 14), 0, y0, L - 0.04);
  if (style < 0.33) at(g, tube(0.02, 0.13, M.dark(), 16), 0, y0 + 0.07, L * 0.3); // an integrated sight tube on a handle
  else if (style > 0.66) at(g, prof([[L * 0.25, y0 + 0.05], [L * 0.75, y0 + 0.05], [L * 0.73, y0 + 0.075], [L * 0.27, y0 + 0.075]], 0.016, shell, 0.003), 0, 0, 0); // carry handle
  else railTop(g, L * 0.3, L * 0.85, y0 + 0.035, M.alloy());
  return { g, a: { grip: [gz - 0.01, y0 - 0.07], fore: [L * 0.85, y0 - 0.015], well: [L * 0.24, y0 - 0.14], bolt: [L * 0.35, y0 + 0.03], sight: [L * 0.45, y0 + (style > 0.66 ? 0.08 : 0.05)], muzzle: [L + bl, y0] }, kind: 'long' };
}

function smg(r) {
  // submachine guns: a slim tube receiver (curved mag ahead of the grip), a boxy polymer one
  // (straight mag), or a box receiver with the mag up the grip
  const g = new THREE.Group(), y0 = 0.15, style = Math.floor(r() * 3), furn = M[POLYS[Math.floor(r() * POLYS.length)]](), steel = M.park();
  const zR = 0.22, rl = 0.2 + r() * 0.06, bl = 0.06 + r() * 0.12;
  let well;
  if (style === 0) {
    at(g, tube(0.024, rl, steel, 16), 0, y0, zR);
    at(g, tube(0.009, rl * 0.35, steel, 10), 0, y0 + 0.032, zR + rl * 0.62); // cocking tube
    at(g, prof(rect(zR + rl * 0.55, y0 - 0.03, zR + rl + 0.02, y0 + 0.015, 0.01), 0.05, furn, 0.004), 0, 0, 0);
    pistolGrip(g, r, zR + 0.02, y0 - 0.02, 0.085, furn, 0.25, 0.03, 0);
    triggerGuard(g, zR + 0.05, y0 - 0.022, 0.05, furn, false);
    curvedMag(g, zR + rl * 0.35, y0 - 0.02, 0.14 + r() * 0.04, 0.035, M.dark(), 0.05, 0.022);
    well = [zR + rl * 0.37, y0 - 0.1];
  } else if (style === 1) {
    at(g, prof(rect(zR - 0.02, y0 - 0.04, zR + rl, y0 + 0.035, 0.012), 0.05, furn, 0.005), 0, 0, 0);
    railTop(g, zR, zR + rl - 0.01, y0 + 0.035, M.alloy());
    pistolGrip(g, r, zR + 0.04, y0 - 0.04, 0.085, furn, 0.22, 0.032, 2);
    triggerGuard(g, zR + 0.07, y0 - 0.04, 0.05, furn, true);
    straightMag(g, zR + rl * 0.55, y0 - 0.04, 0.13 + r() * 0.04, 0.035, M.dark(), 0.008, 0.024);
    well = [zR + rl * 0.57, y0 - 0.12];
  } else {
    at(g, prof(rect(zR - 0.01, y0 - 0.03, zR + rl, y0 + 0.032, 0.006), 0.044, steel, 0.003), 0, 0, 0);
    pistolGrip(g, r, zR + rl * 0.3, y0 - 0.03, 0.1, furn, 0.12, 0.032, 0);
    straightMag(g, zR + rl * 0.3 - 0.012, y0 - 0.12, 0.1 + r() * 0.06, 0.03, M.dark(), -0.004, 0.022); // up the grip, sticking out below
    triggerGuard(g, zR + rl * 0.3 + 0.03, y0 - 0.03, 0.05, steel, true);
    well = [zR + rl * 0.3, y0 - 0.2];
  }
  at(g, tube(0.008, bl + 0.02, steel, 12), 0, y0, zR + rl - 0.02);
  const st = r(); stock(g, r, st < 0.4 ? 'tube' : st < 0.7 ? 'folder' : 'skeleton', zR - (style === 1 ? 0.02 : 0), y0 + 0.015, furn, 0.22);
  return { g, a: { grip: [style === 2 ? zR + rl * 0.27 : zR + 0.02, y0 - 0.06], fore: [zR + rl * 0.75, y0 - (style === 1 ? 0.025 : 0.015)], well, bolt: [zR + rl * 0.5, y0 + 0.03], sight: [zR + 0.04, y0 + 0.04], muzzle: [zR + rl + bl, y0] }, kind: 'long' };
}

function shotgun(r, k) {
  const g = new THREE.Group(), y0 = 0.16, wood = r() < 0.55, furn = wood ? M[WOODS[Math.floor(r() * 3)]]() : M[POLYS[Math.floor(r() * POLYS.length)]](), steel = r() < 0.2 ? M.steel() : M.blued();
  if (k === 'double') {
    // break-action: two barrels side by side or stacked, a short action, a splinter fore-end
    const ou = r() < 0.4, sawed = r() < 0.35, bl = sawed ? 0.25 + r() * 0.1 : 0.6 + r() * 0.12, zR = sawed ? 0.12 : 0.34;
    at(g, prof(rect(zR, y0 - 0.03, zR + 0.11, y0 + 0.03, 0.01), 0.044, steel, 0.003), 0, 0, 0);
    for (const s of [-1, 1]) at(g, tube(0.0125, bl, steel, 16), ou ? 0 : s * 0.0135, y0 + (ou ? s * 0.0135 + 0.012 : 0.012), zR + 0.11);
    at(g, prof(rect(zR + 0.11, y0 - 0.035, zR + 0.11 + bl * 0.4, y0 - 0.005, 0.008), 0.04, furn, 0.004), 0, 0, 0);
    if (sawed) pistolGrip(g, r, zR - 0.005, y0 - 0.02, 0.09, furn, 0.5, 0.034, 2);
    else stock(g, r, 'sporter', zR, y0 + 0.025, furn, 0.34);
    triggerGuard(g, zR + 0.01, y0 - 0.03, 0.06, steel, false);
    return { g, a: { grip: [zR - 0.02, y0 - 0.05], fore: [zR + 0.11 + bl * 0.25, y0 - 0.02], well: [zR + 0.09, y0 + 0.012], bolt: [zR + 0.08, y0 + 0.04], sight: [zR + 0.1, y0 + 0.04], muzzle: [zR + 0.11 + bl, y0 + 0.012] }, kind: 'long', action: 'pump' };
  }
  // pump or semi-auto: receiver, barrel over a magazine tube, a sliding or fixed fore-end
  const zR = 0.32, rl = 0.17, bl = 0.42 + r() * 0.25, tubeL = Math.min(bl * (0.6 + r() * 0.35), bl - 0.02);
  at(g, prof([[zR, y0 - 0.035], [zR + rl, y0 - 0.035], [zR + rl, y0 + 0.03], [zR + 0.02, y0 + 0.034], [zR, y0 + 0.02]], 0.038, k === 'auto' ? M.alloy() : steel, 0.003), 0, 0, 0);
  at(g, tube(0.0115, bl, steel, 16), 0, y0 + 0.012, zR + rl);
  if (bl > 0.55 && r() < 0.6) at(g, boxM(0.008, 0.005, bl, steel), 0, y0 + 0.026, zR + rl + bl / 2); // vent rib
  at(g, tube(0.0115, tubeL, steel, 14), 0, y0 - 0.016, zR + rl);
  const fz = zR + rl + 0.04 + (k === 'pump' ? r() * 0.05 : 0), fl = 0.16 + r() * 0.06;
  at(g, prof(rect(fz, y0 - 0.04, fz + fl, y0 + 0.004, 0.01), 0.05, furn, 0.005), 0, 0, 0);
  if (k === 'pump' && !wood) for (let z = fz + 0.015; z < fz + fl - 0.01; z += 0.012) at(g, boxM(0.052, 0.03, 0.003, M.dark()), 0, y0 - 0.018, z);
  if (k === 'auto') at(g, prof([[zR + rl * 0.6, y0 + 0.004], [zR + rl * 0.8, y0 + 0.004], [zR + rl * 0.8, y0 + 0.012], [zR + rl * 0.6, y0 + 0.012]], 0.052, M.steel(), 0.001), 0, 0, 0); // bolt handle
  frontPost(g, zR + rl + bl - 0.02, y0 + 0.022, M.brass(), 0.006);
  triggerGuard(g, zR + 0.03, y0 - 0.035, 0.06, steel, false);
  const st = r();
  if (st < 0.25) { pistolGrip(g, r, zR, y0 - 0.025, 0.09, furn, 0.4, 0.034, 2); stock(g, r, 'tube', zR, y0 + 0.02, furn, 0.28); }
  else stock(g, r, wood ? 'sporter' : st < 0.6 ? 'fixed' : 'thumbhole', zR, y0 + 0.028, furn, 0.33);
  return { g, a: { grip: [zR - 0.02, y0 - 0.05], fore: [fz + fl * 0.5, y0 - 0.025], well: [zR + rl * 0.5, y0 - 0.04], bolt: [zR + rl * 0.7, y0 + 0.008], sight: [zR + 0.06, y0 + 0.036], muzzle: [zR + rl + bl, y0 + 0.012] }, kind: 'long', action: k === 'pump' ? 'pump' : 'mag' };
}

function boltRifle(r, k) {
  const g = new THREE.Group(), y0 = 0.17, heavy = k === 'heavy', steel = r() < 0.3 ? M.steel() : M.blued();
  const style = heavy ? 'heavy' : r() < 0.4 ? 'wood' : r() < 0.7 ? 'synthetic' : 'chassis';
  const furn = style === 'wood' ? M[WOODS[Math.floor(r() * 3)]]() : M[POLYS[Math.floor(r() * POLYS.length)]]();
  const zR = 0.34, rl = heavy ? 0.36 : 0.2, bl = (heavy ? 0.7 : 0.5) + r() * 0.16;
  if (heavy) {
    const hrl = rl * (0.85 + r() * 0.3), bk = 0.07 + r() * 0.06, hgL = 0.14 + r() * 0.14, hm = r() < 0.5 ? M.park() : M.fde();
    at(g, prof(rect(zR, y0 - 0.05, zR + hrl, y0 + 0.04, 0.008), 0.06, hm, 0.004), 0, 0, 0);
    railTop(g, zR, zR + hrl, y0 + 0.04, M.alloy());
    if (r() < 0.4) at(g, prof([[zR + hrl * 0.3, y0 + 0.05], [zR + hrl * 0.75, y0 + 0.05], [zR + hrl * 0.72, y0 + 0.085], [zR + hrl * 0.33, y0 + 0.085]], 0.016, hm, 0.003), 0, 0, 0); // carry handle
    at(g, tube(0.016, bl, M.park(), 16), 0, y0, zR + hrl);
    at(g, prof(rect(zR + hrl + bl, y0 - 0.022, zR + hrl + bl + bk, y0 + 0.022, 0.006), 0.06, M.park(), 0.003), 0, 0, 0); // the big brake
    for (let i = 0; i < 3; i++) at(g, boxM(0.062, 0.03, 0.008, M.dark()), 0, y0, zR + hrl + bl + bk * (0.25 + i * 0.25));
    at(g, prof(rect(zR + hrl, y0 - 0.04, zR + hrl + hgL, y0 + 0.03, 0.006), 0.066, hm, 0.003), 0, 0, 0);
    straightMag(g, zR + hrl * 0.35, y0 - 0.05, 0.08 + r() * 0.05, 0.09, M.dark(), 0.0, 0.05);
    pistolGrip(g, r, zR + hrl * 0.15, y0 - 0.05, 0.09, M.poly(), 0.3, 0.034, 2);
    stock(g, r, r() < 0.6 ? 'precision' : 'skeleton', zR, y0 + 0.03, hm, 0.26 + r() * 0.08);
    return { g, a: { grip: [zR + hrl * 0.13, y0 - 0.09], fore: [zR + hrl + hgL * 0.6, y0 - 0.025], well: [zR + hrl * 0.4, y0 - 0.15], bolt: [zR + hrl * 0.25, y0 + 0.03], sight: [zR + 0.12, y0 + 0.05], muzzle: [zR + hrl + bl + bk, y0] }, kind: 'long', action: 'bolt' };
  }
  // the action (round receiver) and bolt handle
  at(g, tube(0.017, rl, steel, 16), 0, y0 + 0.008, zR);
  at(g, tube(0.0045, 0.05, steel, 8), 0, 0, 0).position.set(0.03, y0 + 0.004, zR + 0.04);
  g.children[g.children.length - 1].rotation.set(0, Math.PI / 2, -0.4);
  at(g, new THREE.Mesh(new THREE.SphereGeometry(0.009, 10, 8), steel), 0.055, y0 - 0.006, zR + 0.04);
  const bt = r() < 0.5 ? 0.0095 : 0.012;
  at(g, tube(bt, bl, steel, 14, bt * 0.75), 0, y0 + 0.008, zR + rl);
  if (style === 'chassis') {
    at(g, prof(rect(zR - 0.02, y0 - 0.04, zR + rl + 0.3, y0 - 0.005, 0.006), 0.05, M.alloy(), 0.003), 0, 0, 0);
    for (let z = zR + rl + 0.02; z < zR + rl + 0.28; z += 0.04) at(g, boxM(0.052, 0.012, 0.022, M.dark()), 0, y0 - 0.022, z);
    pistolGrip(g, r, zR + 0.02, y0 - 0.04, 0.09, M.poly(), 0.3, 0.032, 2);
    straightMag(g, zR + rl * 0.35, y0 - 0.04, 0.06, 0.07, M.dark(), 0, 0.03);
    stock(g, r, r() < 0.5 ? 'precision' : 'skeleton', zR - 0.02, y0 + 0.02, M.alloy(), 0.32);
  } else {
    // a one-piece stock from the butt to the fore-end tip, the grip a curve in it
    const fe = zR + rl + 0.22 + r() * 0.08, mc = style === 'wood' && r() < 0.6;
    at(g, prof([[zR - 0.05, y0 - 0.002], [fe, y0 - 0.002], [fe, y0 - 0.03], [zR + rl + 0.05, y0 - 0.045], [zR + 0.1, y0 - 0.05], [zR + 0.06, y0 - 0.1], [zR + 0.0, y0 - 0.1], [zR - 0.02, y0 - 0.05]], 0.042, furn, 0.005), 0, 0, 0);
    stock(g, r, mc ? 'sporter' : r() < 0.3 ? 'thumbhole' : 'fixed', zR - 0.04, y0 + (mc ? 0.03 : 0.012), furn, 0.32);
    at(g, boxM(0.04, 0.012, 0.06, M.dark()), 0, y0 - 0.045, zR + rl * 0.5); // floor plate
    triggerGuard(g, zR + 0.03, y0 - 0.05, 0.055, steel, false);
  }
  return { g, a: { grip: [zR + 0.02, y0 - 0.07], fore: [zR + rl + 0.12, y0 - 0.02], well: [zR + rl * 0.45, y0 - 0.05], bolt: [zR + 0.045, y0 + 0.0], sight: [zR + 0.08, y0 + 0.03], muzzle: [zR + rl + bl, y0 + 0.008] }, kind: 'long', action: 'bolt' };
}

function leverAction(r) {
  const g = new THREE.Group(), y0 = 0.16, steel = r() < 0.3 ? M.steel() : r() < 0.5 ? M.brass() : M.blued(), furn = M[WOODS[Math.floor(r() * 3)]]();
  const zR = 0.32, rl = 0.15 + r() * 0.05, bl = 0.36 + r() * 0.24, octagon = r() < 0.4;
  at(g, prof([[zR, y0 - 0.04], [zR + rl, y0 - 0.04], [zR + rl, y0 + 0.028], [zR + 0.02, y0 + 0.032], [zR, y0 + 0.02]], 0.036, steel, 0.003), 0, 0, 0);
  at(g, tube(0.011, bl, M.blued(), octagon ? 8 : 16), 0, y0 + 0.01, zR + rl);
  at(g, tube(0.009, bl * (0.65 + r() * 0.3), M.blued(), 14), 0, y0 - 0.016, zR + rl);
  at(g, prof(rect(zR + rl, y0 - 0.035, zR + rl + 0.16 + r() * 0.06, y0 - 0.002, 0.008), 0.042, furn, 0.004), 0, 0, 0);
  // the lever: a loop behind the trigger, open or big-loop
  const big = r() < 0.3, lz = zR + 0.02, ly = y0 - 0.04;
  at(g, prof([[lz, ly], [lz + 0.11, ly], [lz + 0.1, ly - 0.012], [lz + 0.03, ly - 0.012], [lz + 0.03, ly - (big ? 0.07 : 0.05)], [lz - 0.06, ly - (big ? 0.07 : 0.05)], [lz - 0.07, ly - 0.03], [lz - 0.058, ly - 0.03], [lz - 0.052, ly - (big ? 0.058 : 0.04)], [lz + 0.016, ly - (big ? 0.058 : 0.04)], [lz + 0.016, ly - 0.01], [lz, ly - 0.01]], 0.008, steel, 0.001), 0, 0, 0);
  at(g, prof([[zR - 0.004, y0 + 0.016], [zR + 0.006, y0 + 0.03], [zR + 0.012, y0 + 0.024], [zR + 0.004, y0 + 0.01]], 0.008, steel, 0.001), 0, 0, 0); // hammer
  stock(g, r, r() < 0.6 ? 'sporter' : 'fixed', zR, y0 + 0.02, furn, 0.29 + r() * 0.07);
  for (let i = 0, n = Math.floor(r() * 3); i < n; i++) at(g, tube(0.013, 0.008, steel, 12), 0, y0 - 0.003, zR + rl + bl * (0.55 + i * 0.25)); // barrel bands
  if (r() < 0.35) at(g, new THREE.Mesh(new THREE.TorusGeometry(0.012, 0.0022, 6, 14), steel), 0.02, y0 - 0.01, zR + rl * 0.5); // saddle ring
  frontPost(g, zR + rl + bl - 0.02, y0 + 0.02, M.brass(), 0.008);
  at(g, boxM(0.014, 0.012, 0.012, M.blued()), 0, y0 + 0.026, zR + rl + 0.12);
  return { g, a: { grip: [zR - 0.01, y0 - 0.05], fore: [zR + rl + 0.08, y0 - 0.02], well: [zR + rl * 0.7, y0 - 0.0], bolt: [zR + 0.04, y0 - 0.07], sight: [zR + rl + 0.11, y0 + 0.034], muzzle: [zR + rl + bl, y0 + 0.01] }, kind: 'long', action: 'pump' };
}

function semiHunter(r) {
  // semi-auto rifles in a full-length stock: wood up to near the muzzle, a top hand guard, a short box
  // or fixed magazine
  const g = new THREE.Group(), y0 = 0.17, wood = r() < 0.7, furn = wood ? M[WOODS[Math.floor(r() * 3)]]() : M[POLYS[Math.floor(r() * POLYS.length)]](), steel = r() < 0.3 ? M.steel() : M.park();
  const zR = 0.33, rl = 0.2, bl = 0.42 + r() * 0.14, fe = zR + rl + 0.24 + r() * 0.1;
  at(g, prof(rect(zR, y0 - 0.025, zR + rl, y0 + 0.028, 0.006), 0.032, steel, 0.002), 0, 0, 0);
  at(g, tube(0.0095, bl, steel, 14), 0, y0 + 0.006, zR + rl);
  at(g, prof([[zR - 0.04, y0 - 0.004], [fe, y0 - 0.004], [fe, y0 - 0.028], [zR + rl, y0 - 0.044], [zR + 0.1, y0 - 0.05], [zR + 0.05, y0 - 0.1], [zR - 0.01, y0 - 0.1], [zR - 0.03, y0 - 0.04]], 0.044, furn, 0.005), 0, 0, 0);
  if (r() < 0.6) at(g, prof(rect(zR + rl + 0.02, y0 + 0.012, fe - 0.03, y0 + 0.03, 0.006), 0.034, furn, 0.004), 0, 0, 0); // top guard
  stock(g, r, r() < 0.7 ? 'fixed' : 'sporter', zR - 0.03, y0 + 0.018, furn, 0.32);
  const mag = r(); if (mag < 0.5) straightMag(g, zR + rl * 0.4, y0 - 0.044, 0.05 + r() * 0.05, 0.05, M.park(), 0.004, 0.026);
  triggerGuard(g, zR + 0.03, y0 - 0.05, 0.055, steel, true);
  frontPost(g, zR + rl + bl - 0.03, y0 + 0.014, steel, 0.03);
  at(g, prof([[zR + 0.0, y0 + 0.028], [zR + 0.04, y0 + 0.028], [zR + 0.04, y0 + 0.048], [zR + 0.0, y0 + 0.044]], 0.02, steel, 0.0015), 0, 0, 0); // aperture rear sight
  return { g, a: { grip: [zR + 0.02, y0 - 0.07], fore: [zR + rl + 0.12, y0 - 0.015], well: [zR + rl * 0.42, y0 - 0.09], bolt: [zR + rl * 0.6, y0 + 0.03], sight: [zR + 0.02, y0 + 0.05], muzzle: [zR + rl + bl, y0 + 0.006] }, kind: 'long' };
}

function launcher(r, k) {
  const g = new THREE.Group(), y0 = 0.15;
  if (k === 'grenade') {
    if (r() < 0.5) { // break-open single shot: a fat barrel on a wood or polymer stock
      const furn = r() < 0.7 ? M[WOODS[Math.floor(r() * 3)]]() : M[POLYS[Math.floor(r() * POLYS.length)]](), zR = 0.28 + r() * 0.06, bl = 0.24 + r() * 0.12, br = 0.022 + r() * 0.005;
      at(g, prof(rect(zR, y0 - 0.035, zR + 0.12, y0 + 0.035, 0.01), 0.05, M.park(), 0.004), 0, 0, 0);
      at(g, tube(br, bl, M.park(), 18), 0, y0 + 0.005, zR + 0.12);
      at(g, prof(rect(zR + 0.12, y0 - 0.04, zR + 0.12 + bl * 0.6, y0 - 0.018, 0.008), 0.05, furn, 0.004), 0, 0, 0);
      if (r() < 0.6) at(g, prof([[zR + 0.13, y0 + 0.03], [zR + 0.16, y0 + 0.03], [zR + 0.155, y0 + 0.075], [zR + 0.135, y0 + 0.075]], 0.03, M.park(), 0.002), 0, 0, 0); // leaf sight
      stock(g, r, r() < 0.6 ? 'fixed' : 'sporter', zR, y0 + 0.02, furn, zR);
      triggerGuard(g, zR + 0.02, y0 - 0.035, 0.06, M.park(), false);
      return { g, a: { grip: [zR - 0.02, y0 - 0.05], fore: [zR + 0.12 + bl * 0.3, y0 - 0.025], well: [zR + 0.1, y0], bolt: [zR + 0.1, y0 + 0.04], sight: [zR + 0.1, y0 + 0.04], muzzle: [zR + 0.12 + bl, y0 + 0.005] }, kind: 'long', action: 'pump' };
    }
    // the six-shot revolver kind: a big drum, short barrel, folding stock
    const zR = 0.24 + r() * 0.04, dr = 0.05 + r() * 0.014, dl = 0.11 + r() * 0.05, bl = 0.14 + r() * 0.1, col = r() < 0.5 ? M.park() : M.olive();
    at(g, tube(dr, dl, col, 18), 0, y0, zR);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; at(g, tube(0.015, dl + 0.005, M.dark(), 10), Math.cos(a) * dr * 0.62, y0 + Math.sin(a) * dr * 0.62, zR - 0.002); }
    at(g, tube(0.024, bl, M.park(), 16), 0, y0 + 0.03, zR + dl);
    at(g, prof(rect(zR + dl, y0 - 0.012, zR + dl + bl * 0.9, y0 + 0.006, 0.004), 0.03, col, 0.002), 0, 0, 0);
    pistolGrip(g, r, zR - 0.02, y0 - 0.05, 0.09, M.poly(), 0.3, 0.032, 2);
    stock(g, r, r() < 0.6 ? 'tube' : 'skeleton', zR - 0.02, y0 - 0.0, M.poly(), 0.22 + r() * 0.06);
    return { g, a: { grip: [zR - 0.04, y0 - 0.09], fore: [zR + dl + bl * 0.5, y0 - 0.02], well: [zR + 0.06, y0 - 0.05], bolt: [zR + 0.05, y0 + 0.06], sight: [zR + 0.1, y0 + 0.07], muzzle: [zR + dl + bl, y0 + 0.03] }, kind: 'long', action: 'pump' };
  }
  // a shoulder-fired tube: plain disposable tube, or a reloadable tube with a warhead sticking out
  const L = 0.85 + r() * 0.2, rr = 0.035 + r() * 0.02, col = r() < 0.5 ? M.olive() : M.fde();
  at(g, tube(rr, L, col, 20), 0, y0 + 0.04, 0);
  for (const z of [0.02, L - 0.06]) at(g, tube(rr + 0.006, 0.04, M.dark(), 20), 0, y0 + 0.04, z);
  const reload = r() < 0.45;
  if (reload) { at(g, tube(0.02, 0.12, M.olive(), 14, 0.045), 0, y0 + 0.04, L); at(g, tube(0.045, 0.12, M.olive(), 14, 0.0), 0, y0 + 0.04, L + 0.12); }
  pistolGrip(g, r, L * 0.35, y0 + 0.04 - rr, 0.09, M.poly(), 0.15, 0.032, 2);
  pistolGrip(g, r, L * 0.55, y0 + 0.04 - rr, 0.08, M.poly(), 0.0, 0.03, 0);
  at(g, prof(rect(L * 0.45, y0 + 0.04 + rr, L * 0.55, y0 + 0.04 + rr + 0.04, 0.006), 0.014, M.dark(), 0.002), 0, 0, 0);
  return { g, a: { grip: [L * 0.33, y0 - 0.04], fore: [L * 0.57, y0 - 0.03], well: [L * 0.1, y0], bolt: [L * 0.4, y0 + 0.08], sight: [L * 0.5, y0 + 0.04 + rr + 0.04], muzzle: [reload ? L + 0.24 : L, y0 + 0.04] }, kind: 'long', action: 'pump' };
}

// ---- which layout a catalogue gun gets (its platform, with a few crossovers so a class mixes layouts)
function familyFor(w, r) {
  switch (w.platform) {
    case 'service': return r() < 0.75 ? striker(r, 'service') : nineteen11(r);
    case 'compact': return striker(r, 'compact');
    case 'machine': return striker(r, 'machine');
    case 'target': return r() < 0.6 ? nineteen11(r) : revolver(r);
    case 'magnum': return revolver(r);
    case 'carbine': return r() < 0.7 ? arPattern(r, 'carbine') : akPattern(r, 'carbine');
    case 'battle': return r() < 0.6 ? battle(r) : r() < 0.5 ? arPattern(r, 'battle') : akPattern(r, 'battle');
    case 'bullpup': return bullpup(r);
    case 'pdw': return r() < 0.8 ? smg(r) : akPattern(r, 'pdw');
    case 'pump': return shotgun(r, 'pump');
    case 'auto': return shotgun(r, 'auto');
    case 'double': return shotgun(r, 'double');
    case 'bolt': return boltRifle(r, 'bolt');
    case 'heavy': return boltRifle(r, 'heavy');
    case 'dmr': return r() < 0.6 ? arPattern(r, 'dmr') : semiHunter(r);
    case 'lever': return leverAction(r);
    case 'semi': return semiHunter(r);
    case 'tube': return launcher(r, 'tube');
    case 'grenade': return launcher(r, 'grenade');
    default: return null;
  }
}

// The model and its hold description for a catalogue gun (deterministic: the same id, the same gun)
const cache = new Map();
export function kitGun(w) {
  if (cache.has(w.id)) { const c = cache.get(w.id); return { scene: c.scene.clone(true), G: c.G }; }
  const r = rng(hash(w.id) ^ 0x6b17);
  const built = familyFor(w, r);
  if (!built) return null;
  const { g, a } = built;
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), size = box.getSize(new THREE.Vector3());
  const fx = (p) => [(p[0] - box.min.z) / size.z, (p[1] - box.min.y) / size.y];
  const G = {
    kit: true, m: 'kit:' + w.id, real: 1, axis: '+z', len: size.z / ((w.model && w.model.s) || 1), kind: built.kind, action: built.action || (w.platform === 'bolt' || w.platform === 'heavy' ? 'bolt' : w.cat === 'shotgun' ? 'pump' : 'mag'),
    revolver: !!built.revolver, scoped: false,
    g: fx(a.grip), f: a.fore ? fx(a.fore) : undefined, w: fx(a.well), b: fx(a.bolt), t: fx(a.sight), bore: Math.min(0.95, Math.max(0.05, (a.muzzle[1] - box.min.y) / size.y)),
  };
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  cache.set(w.id, { scene: g, G });
  return { scene: g.clone(true), G };
}
// a stable signature of a gun's layout and proportions (QA: no two catalogue guns alike)
export function kitSignature(w) {
  const k = kitGun(w); if (!k) return null;
  let n = 0; k.scene.traverse((o) => { if (o.isMesh) n++; });
  const b = new THREE.Box3().setFromObject(k.scene).getSize(new THREE.Vector3());
  return [n, b.x, b.y, b.z].map((v) => Math.round(v * 400)).join(',');
}
