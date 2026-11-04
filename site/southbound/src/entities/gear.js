// Body armour, helmets, bags, holsters and medical supplies.
//
// Armour protection follows the real NIJ levels: IIIA soft armour stops
// handgun rounds; Level III plates stop rifle ball; III+ adds the common
// steel-core rifle rounds; Level IV ceramic stops armour-piercing rifle
// rounds. Plates only cover the chest and back. Penetration on the weapon
// side runs 1..6 (pistol 2, rifle 3, AP rifle 4+), so a plate "level"
// below stops anything with penetration at or under it.
//
// Bags hide long guns from the police (each bag has room for a number of
// guns up to a length); holsters decide whether your sidearm shows.
import * as THREE from 'three';
import { attachToBone, bodyMetres, suitMesh } from './clothing.js';

export const ARMOR = [
  { id: 'soft-conceal', name: 'Concealable vest (IIIA)', level: 2, plates: 0, weight: 2.2, price: 480, hidden: true, color: 0x2a2a2a, durability: 10, desc: 'Thin soft armour worn under a shirt. Stops handgun rounds. Nobody can tell you have it on.' },
  { id: 'soft-patrol', name: 'Patrol vest (IIIA)', level: 2, plates: 0, weight: 2.8, price: 620, color: 0x1d2a44, durability: 12, desc: 'Outer soft vest like the police wear. Stops handgun rounds and buckshot.' },
  { id: 'pc-steel', name: 'Plate carrier, steel plates (III)', level: 3, plates: 2, weight: 7.5, price: 950, color: 0x6b5d45, durability: 30, desc: 'AR500 steel. Stops rifle ball and takes a beating, but it is heavy and spalls.' },
  { id: 'pc-pe', name: 'Plate carrier, polyethylene (III)', level: 3, plates: 2, weight: 3.6, price: 1450, color: 0x3c4a32, durability: 12, desc: 'UHMWPE plates. Very light. Stops rifle ball; steel-core rounds go through.' },
  { id: 'pc-ceramic', name: 'Plate carrier, ceramic (III+)', level: 3.5, plates: 2, weight: 5.2, price: 1900, color: 0x1a1a1a, durability: 8, desc: 'Ceramic strike face. Stops steel-core rifle rounds. Cracks after repeated hits.' },
  { id: 'pc-level4', name: 'Plate carrier, ceramic (IV)', level: 4, plates: 2, weight: 6.6, price: 2750, color: 0x8a7a5a, pattern: 'camo', durability: 6, desc: 'Level IV. Stops armour-piercing rifle rounds, once or twice per plate.' },
  { id: 'pc-heavy', name: 'Heavy carrier, IV + side plates', level: 4, plates: 4, weight: 9.8, price: 4100, color: 0x2b2b2b, sides: true, durability: 9, desc: 'Front, back and side plates plus a groin protector. You will feel it on the stairs.' },
  { id: 'chest-rig', name: 'Chest rig (no armour)', level: 0, plates: 0, weight: 1.2, price: 160, color: 0x5a5340, rig: true, durability: 0, desc: 'Magazine pouches on a harness. Carries two extra magazines. No protection.' },
];
export const HELMETS = [
  { id: 'bump', name: 'Bump helmet', level: 0, price: 210, color: 0x3c4a32, desc: 'Protects against knocks, not bullets.' },
  { id: 'ballistic', name: 'Ballistic helmet (IIIA)', level: 2, price: 890, color: 0x2a2a2a, desc: 'High-cut aramid helmet. Stops most handgun rounds to the head.' },
  { id: 'ballistic-tan', name: 'Ballistic helmet (IIIA), tan', level: 2, price: 920, color: 0x8a7a5a, desc: 'Same helmet, desert tan.' },
];
// slots: how many long guns it hides; len: the longest gun (m) that fits
export const BAGS = [
  { id: 'daypack', name: 'Daypack (25 L)', slots: 1, len: 0.62, price: 85, color: 0x2f3a4a, desc: 'Hides one compact gun: an SMG, a folded carbine, a sawn-off.' },
  { id: 'hiking', name: 'Hiking pack (45 L)', slots: 1, len: 0.9, price: 170, color: 0x7a3a22, desc: 'Hides one rifle or shotgun up to 90 cm, broken down.' },
  { id: 'rifle-pack', name: 'Discreet rifle pack', slots: 2, len: 0.95, price: 290, color: 0x222222, desc: 'Looks like a laptop bag. Two rifles up to 95 cm.' },
  { id: 'guitar', name: 'Guitar case', slots: 1, len: 1.12, price: 140, color: 0x1a1410, desc: 'A long rifle fits where the guitar should be. Very convincing.' },
  { id: 'duffel', name: 'Duffel bag', slots: 3, len: 1.05, price: 120, color: 0x3a4a3a, desc: 'Three long guns, slung on your back. It is a lot of bag.' },
];
export const HOLSTERS = [
  { id: 'owb', name: 'Belt holster (open carry)', conceal: 'never', price: 0, desc: 'On your hip, in plain sight.' },
  { id: 'iwb', name: 'Inside-the-waistband holster', conceal: 'untucked', price: 55, desc: 'Hidden under an untucked shirt or any jacket.' },
  { id: 'shoulder', name: 'Shoulder holster', conceal: 'jacket', price: 85, desc: 'Under the arm. Hidden under any jacket.' },
  { id: 'ankle', name: 'Ankle holster', conceal: 'long-pants', price: 70, desc: 'Hidden under long trousers. Slower to draw.' },
];
export const MEDS = [
  { id: 'bandage', name: 'Bandage roll', price: 12, max: 10, heal: 8, bleed: 1, desc: 'Slows light bleeding.' },
  { id: 'dressing', name: 'Pressure dressing', price: 25, max: 8, heal: 15, bleed: 2, desc: 'Stops most bleeding.' },
  { id: 'tourniquet', name: 'Tourniquet', price: 38, max: 4, heal: 4, bleed: 3, limb: true, desc: 'Stops bleeding from an arm or leg at once.' },
  { id: 'gauze', name: 'Hemostatic gauze', price: 55, max: 5, heal: 20, bleed: 3, desc: 'Packs deep wounds and stops heavy bleeding.' },
  { id: 'splint', name: 'SAM splint', price: 30, max: 4, heal: 3, fix: ['leg', 'arm'], desc: 'Splints a shot leg or arm: walk properly, aim steadier.' },
  { id: 'painkillers', name: 'Painkillers', price: 9, max: 6, heal: 5, numb: 180, desc: 'Masks wound penalties for three minutes.' },
  { id: 'ifak', name: 'IFAK (first aid kit)', price: 140, max: 3, heal: 45, bleed: 3, fix: ['leg'], desc: 'Individual first aid kit: stops bleeding, heals, treats one wound.' },
  { id: 'trauma', name: 'Trauma bag', price: 420, max: 1, heal: 100, bleed: 3, fix: ['leg', 'arm'], desc: 'Everything a medic carries. Full heal, treats all wounds.' },
];
export const GEAR = { armor: ARMOR, helmet: HELMETS, bag: BAGS, holster: HOLSTERS };
export const gearById = (k, id) => (GEAR[k] || []).find((g) => g.id === id) || null;

// How long a weapon is (m), for bags
export function weaponLength(w) {
  if (!w) return 0;
  if (w.melee) return w.len || 0.3;
  const p = w.platform || '';
  if (w.cat === 'pistol') return p === 'machine' ? 0.32 : 0.22;
  if (/pdw|smg/.test(p) || w.cat === 'smg') return 0.6;
  if (w.cat === 'shotgun') return /sawn|short/.test(w.id + p) ? 0.6 : 0.98;
  if (w.cat === 'sniper') return 1.15;
  if (w.cat === 'marksman') return 1.05;
  if (w.cat === 'launcher') return 1.0;
  if (w.cat === 'bow') return 1.0;
  return /bullpup|compact/.test(p) ? 0.72 : 0.88;
}

// ---------------------------------------------------------------- models
const M = (c, r = 0.85, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
function camoTex(hex) {
  const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
  const base = new THREE.Color(hex); x.fillStyle = '#' + base.getHexString(); x.fillRect(0, 0, 64, 64);
  const tones = ['#5b5a3a', '#3a3424', '#8c8460', '#6b5a3c'];
  for (let i = 0; i < 40; i++) { x.fillStyle = tones[i % 4]; x.beginPath(); x.ellipse(Math.random() * 64, Math.random() * 64, 3 + Math.random() * 7, 2 + Math.random() * 5, Math.random() * 3, 0, 7); x.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}
const fabricOf = (g) => g.pattern === 'camo' ? new THREE.MeshStandardMaterial({ map: camoTex(g.color), roughness: 0.9 }) : M(g.color, 0.9);

// carrier around the chest: origin at the chest centre, +z forward (metres)
export function buildCarrier(a, puff = 0) {
  // `puff`: how far the clothes stand off the body (a puffy jacket pushes the carrier out)
  const P = 0.022 + puff;
  const g = new THREE.Group(), cloth = fabricOf(a), dark = M(0x151515, 0.8);
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); g.add(o); return o; };
  const thick = a.plates ? 0.04 : 0.022, w = a.plates ? 0.29 : 0.34, h = a.plates ? 0.34 : 0.4;
  const FZ = 0.15 + P, BZ = -0.158 - P; // plate faces: front and back, just off the clothes
  add(new THREE.BoxGeometry(w, h, thick), cloth, 0, 0.0, FZ);
  add(new THREE.BoxGeometry(w, h, thick), cloth, 0, 0.0, BZ);
  // cummerbund
  const band = new THREE.CylinderGeometry(1, 1, 0.13, 28, 1, true);
  const b = add(band, cloth, 0, -0.12, -0.005); b.scale.set(0.205 + P, 1, 0.18 + P); b.material = cloth.clone(); b.material.side = THREE.DoubleSide;
  // shoulder straps
  // shoulder straps: up from the top of each plate, over the shoulder, down to the other plate
  const seg = (y1, z1, y2, z2, x) => { const L = Math.hypot(y2 - y1, z2 - z1); const st = add(new THREE.BoxGeometry(0.05, 0.014, L), cloth, x, (y1 + y2) / 2, (z1 + z2) / 2); st.rotation.x = -Math.atan2(y2 - y1, z2 - z1); return st; };
  for (const s of [-1, 1]) {
    const x = s * 0.105, top = 0.215 + P * 0.6;
    seg(h / 2 - 0.01, FZ, top - 0.01, 0.07, x);
    seg(top, 0.075, top, -0.075, x);
    seg(top - 0.01, -0.075, h / 2 - 0.01, BZ, x);
    add(new THREE.BoxGeometry(0.052, 0.006, 0.05), dark, x, top + 0.008, 0); // the pad over the collarbone
  }
  if (a.plates || a.rig) for (let i = -1; i <= 1; i++) { add(new THREE.BoxGeometry(0.075, 0.12, 0.05), cloth, i * 0.085, -0.075, FZ + 0.035); add(new THREE.BoxGeometry(0.06, 0.02, 0.052), dark, i * 0.085, -0.02, FZ + 0.035); }
  if (a.plates) { add(new THREE.BoxGeometry(0.16, 0.08, 0.035), cloth, 0, 0.08, FZ + 0.03); add(new THREE.BoxGeometry(0.12, 0.012, 0.01), M(0xc8c8c8, 0.6), 0, 0.125, FZ + 0.049); }
  if (a.sides) for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.03, 0.15, 0.16), cloth, s * (0.212 + P), -0.1, 0);
  if (a.id === 'soft-patrol') { const badge = add(new THREE.BoxGeometry(0.06, 0.07, 0.008), M(0xc9a640, 0.3, 0.9), -0.08, 0.08, FZ + 0.015); void badge; }
  if (a.rig) { g.children.slice(0, 2).forEach((o) => { o.visible = false; }); }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
  return g;
}
export function buildHelmet(hm) {
  const g = new THREE.Group(), m = M(hm.color, 0.7);
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.128, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.52), m); shell.scale.set(1, 0.92, 1.12); shell.position.y = -0.005; g.add(shell);
  for (const s of [-1, 1]) { const rail = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.03, 0.11), M(0x111111, 0.6)); rail.position.set(s * 0.125, -0.005, 0.0); g.add(rail); }
  const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.035, 0.015), M(0x111111, 0.5, 0.4)); shroud.position.set(0, 0.04, 0.138); g.add(shroud);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
  return g;
}
// bags on the back: origin between the shoulder blades, -z is behind you
export function buildBag(b) {
  const g = new THREE.Group(), m = M(b.color, 0.85), strapM = M(0x111111, 0.8);
  const add = (geo, mm, x, y, z) => { const o = new THREE.Mesh(geo, mm); o.position.set(x, y, z); g.add(o); return o; };
  if (b.id === 'guitar') {
    const body = add(new THREE.CylinderGeometry(0.17, 0.2, 0.08, 18), m, 0, -0.2, -0.25); body.rotation.x = Math.PI / 2; body.scale.set(1, 1, 1.25);
    add(new THREE.BoxGeometry(0.1, 0.62, 0.07), m, 0, 0.25, -0.25);
    g.rotation.z = 0.35;
  } else if (b.id === 'duffel') {
    const d = add(new THREE.CylinderGeometry(0.15, 0.15, 0.68, 16), m, 0, 0, -0.27); d.rotation.z = Math.PI / 2 - 0.4;
  } else {
    const dims = { daypack: [0.28, 0.4, 0.14], hiking: [0.32, 0.58, 0.2], 'rifle-pack': [0.3, 0.5, 0.11] }[b.id] || [0.3, 0.45, 0.15];
    add(new THREE.BoxGeometry(...dims), m, 0, -0.05 + (b.id === 'hiking' ? 0.04 : 0), -0.165 - dims[2] / 2);
    add(new THREE.BoxGeometry(dims[0] * 0.8, dims[1] * 0.3, 0.05), m, 0, -0.05 - dims[1] * 0.22, -0.165 - dims[2] - 0.02);
    if (b.id === 'hiking') add(new THREE.BoxGeometry(dims[0] * 1.02, 0.08, dims[2] * 1.05), M(0x2a2a2a, 0.8), 0, 0.26, -0.165 - dims[2] / 2);
  }
  for (const s of [-1, 1]) { const st = add(new THREE.BoxGeometry(0.04, 0.4, 0.015), strapM, s * 0.09, -0.02, 0.17); st.rotation.x = 0.1; }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
  return g;
}

// Put a set of gear on a person. Returns a handle to swap it later.
export function wearGear(h, gear, opts = {}) {
  const mesh = suitMesh(h);
  const state = { parts: [] };
  const clear = () => { for (const p of state.parts) p.parent?.remove(p); state.parts.length = 0; };
  const apply = (gs) => {
    clear();
    if (!mesh) return;
    const mpu = bodyMetres(h, mesh);
    const a = gearById('armor', gs.armor), hm = gearById('helmet', gs.helmet), b = gearById('bag', gs.bag);
    if (a && !a.hidden) { const m = buildCarrier(a, (typeof opts.puff === 'function' ? opts.puff() : opts.puff) || 0); if (attachToBone(mesh, 'spine02', m, [0, 0.49, -0.115], mpu)) state.parts.push(m); }
    if (hm) { const m = buildHelmet(hm); m.userData.head = true; if (attachToBone(mesh, 'head', m, [0, 0.905, -0.075], mpu)) state.parts.push(m); }
    if (b) { const m = buildBag(b); if (attachToBone(mesh, 'spine02', m, [0, 0.52, -0.115], mpu)) state.parts.push(m); }
  };
  apply(gear || {});
  return { apply, clear, parts: state.parts, headVisible(v) { for (const p of state.parts) if (p.userData.head) p.visible = v; } };
}
