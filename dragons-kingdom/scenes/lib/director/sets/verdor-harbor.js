// Shot director set - VERDOR_HARBOR (scene 1C at quay level: X4-04, X4-05, X4-07, X4-09).
//
// A THIN WRAPPER over VERDOR_AERIAL (sets/verdor-aerial.js): the same terrain, sea, harbour basin, breakwater,
// quay + warehouses (architecture harbor()), terraced town, palace and the Santa Maria (props santaMaria(), the
// 22 m three-masted ship, sails furled) are built by that builder from the SAME map (the spec's `map` is the
// verdor-aerial spec's MAP plus a `harbor` block), so the ground shots and the aerials can never disagree about
// the layout. This file only adds the quay-level dressing, all procedural (plain three.js meshes, no assets):
//   bollards   stone mooring posts along the quay coping (x 261, every ~11 m)
//   slipway    a dressed-stone ramp at the quay's south end (MAP.slipway: [265, 0, 1715] running down EAST,
//              26 m, 8 m wide) with timber skids; the ground function follows it (actors walk up it)
//   boats      small open boats (planked hull, thwarts): two hauled out beside the slipway, and the two
//              hauling boats `boatA` / `boatB` (set objects: keyed per shot in `set.boats`, actors can ride them)
//   net        the hauled net between boatA and boatB (rebuilt per frame: top rope with floats, the bag sagging
//              under water) + the haul line from the net to a cast member's point (`set.haul`), a drying net
//   catch      fish baskets (wicker cylinders with fish) and a fish heap on the quay (MAP.harbor.catch)
//   market     stalls along the east side of the market street on terrace 1 (MAP.harbor.stalls): counter,
//              four posts, a sagging cloth roof (dyed colours), goods on the counter
// The map's quay apron is the harbor() paving (top 2.8 m), a little above the terrain (2.6 m): `ground` returns
// the paving / slipway height there so people and dragons stand ON the stones.
import * as THREE from 'three';
import * as aerial from './verdor-aerial.js';
import { keyed } from '../timeline.js';

export const cinematic = aerial.cinematic;

const DEF = {
  quayX: 262, quay: { from: [262, 0, 1560], to: [262, 0, 1700], top: 2.8 },
  slipway: { at: [265, 0, 1715], dir: 'east', len: 26, width: 8, top: 2.75, toe: -1.6 },
  harbor: {
    catch: [[251.6, 1660.4], [252.4, 1658.6], [258.6, 1667.2], [259.4, 1665.2], [258.7, 1663.1]],
    heap: [251.2, 1662.2],
    stalls: [[203.2, 1618], [203.0, 1627.5], [203.4, 1637], [203.1, 1646.5], [203.3, 1656], [198.6, 1641.5]],
    hauled: [[[256.5, 1722.5], 200], [[257.5, 1729], 165]],
    dryNet: [[252, 1735], [252, 1743]],
    crates: [[257.8, 1652], [256.9, 1650.5], [258.1, 1640.5]],
    street: { x: [196.8, 205.6], z: [1596, 1700] },
  },
};

const rand = (seed) => { let a = seed >>> 0; return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; }; };
const std = (color, rough = 0.85, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...o });

/** a small open boat: +x bow, y up, origin at the waterline amidships; floor boards at y 0.02 */
function makeBoat(len, beam, paint, seed) {
  const g = new THREE.Group();
  const r = rand(seed);
  const N = 18, M = 6, depth = 0.95, free = 0.55;
  const pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const u = i / N, x = (u - 0.5) * len;
    const w = (beam / 2) * Math.pow(Math.sin(Math.PI * Math.min(Math.max(u, 0.02), 0.98)), 0.55) * (u > 0.5 ? 1 : 0.92 + 0.08 * u * 2);
    const sheer = free + 0.22 * Math.pow(Math.abs(u - 0.5) * 2, 2);
    for (let j = 0; j <= M; j++) {
      const a = (j / M) * Math.PI;                       // 0 = port gunwale, pi = starboard gunwale
      const yz = Math.sin(a);
      pos.push(x, sheer - (sheer + depth - free) * Math.pow(yz, 0.8) - (depth - free) * 0, -Math.cos(a) * w * (0.35 + 0.65 * Math.pow(1 - yz, 0.35)));
    }
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < M; j++) {
    const a = i * (M + 1) + j, b = a + M + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx); geo.computeVertexNormals();
  const hull = new THREE.Mesh(geo, std(paint, 0.8, { side: THREE.DoubleSide }));
  g.add(hull);
  const wood = std(0x5b4631, 0.9);
  for (const tx of [-0.22, 0.12, 0.3]) {                 // thwarts
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.05, beam * 0.86 * Math.sin(Math.PI * (0.5 + tx))), wood);
    t.position.set(tx * len, free - 0.18, 0); g.add(t);
  }
  const floor = new THREE.Mesh(new THREE.BoxGeometry(len * 0.62, 0.04, beam * 0.5), wood);
  floor.position.set(0, 0.0, 0); g.add(floor);
  const rim = std(0x3a2d20, 0.85);                        // a dark gunwale strip
  for (const s of [-1, 1]) {
    const pts = [];
    for (let i = 1; i < N; i++) { const k = (i * (M + 1)) + (s < 0 ? 0 : M); pts.push(new THREE.Vector3(pos[k * 3], pos[k * 3 + 1] + 0.02, pos[k * 3 + 2])); }
    const tube = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.045, 5), rim);
    g.add(tube);
  }
  if (r() < 0.7) {                                        // oars across the thwarts
    for (const s of [-1, 1]) {
      const o = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, len * 0.75, 6), wood);
      o.rotation.z = Math.PI / 2; o.rotation.y = s * 0.12; o.position.set(-0.1, free - 0.08, s * beam * 0.18); g.add(o);
    }
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  return g;
}

/** a fishing-net texture (knotted mesh, alpha) */
function netTexture() {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.clearRect(0, 0, 128, 128);
  x.strokeStyle = 'rgba(70,64,52,1)'; x.lineWidth = 3;
  for (let i = -128; i <= 256; i += 32) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i + 128, 128); x.stroke(); x.beginPath(); x.moveTo(i, 128); x.lineTo(i + 128, 0); x.stroke(); }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export async function build(ctx, opts = {}) {
  const { spec } = opts;
  const base = await aerial.build(ctx, opts);
  const { scene } = ctx;
  const MAP = { ...DEF, ...(spec?.map || {}) };
  const HB = { ...DEF.harbor, ...(MAP.harbor || {}) };
  const SL = { ...DEF.slipway, ...(MAP.slipway || {}) };
  const QT = MAP.quay?.top ?? 2.8;
  const q0 = MAP.quay.from, q1 = MAP.quay.to;
  const slipX0 = SL.at[0] - 3, slipX1 = slipX0 + SL.len, slipZ = SL.at[2], slipW = SL.width ?? 8;
  const slipY = (x) => SL.top + (SL.toe - SL.top) * Math.min(1, Math.max(0, (x - slipX0) / SL.len));
  /** quay paving / slipway / terrain */
  const ground = (x, z) => {
    if (Math.abs(z - slipZ) <= slipW / 2 + 0.6 && x >= slipX0 - 4 && x <= slipX1) return x < slipX0 ? Math.max(base.ground(x, z), SL.top) : slipY(x);
    if (z >= q0[2] && z <= q1[2] && x <= MAP.quayX && x >= MAP.quayX - 8.5) return Math.max(base.ground(x, z), QT);
    return base.ground(x, z);
  };
  const dress = new THREE.Group(); dress.name = 'verdor-harbor-dressing';
  const stone = std(0x9b958a, 0.9), stoneDark = std(0x6f6a62, 0.92), wood = std(0x5e4a35, 0.88), woodDark = std(0x3d3024, 0.9);

  // bollards along the coping
  for (let z = q0[2] + 6; z < q1[2] - 2; z += 11) {
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.32, 0.75, 10), stoneDark);
    b.position.set(MAP.quayX - 0.75, QT + 0.37, z); dress.add(b);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), stoneDark);
    cap.position.set(MAP.quayX - 0.75, QT + 0.74, z); dress.add(cap);
  }
  // the slipway: a stone ramp + side kerbs + timber skids, its foot under the water
  {
    const len = Math.hypot(SL.len, SL.top - SL.toe), ang = Math.atan2(SL.top - SL.toe, SL.len);
    const ramp = new THREE.Mesh(new THREE.BoxGeometry(len, 1.2, slipW), stone);
    ramp.position.set(slipX0 + SL.len / 2, (SL.top + SL.toe) / 2 - 0.6 / Math.cos(ang), slipZ);
    ramp.rotation.z = -ang; dress.add(ramp);
    const fill = new THREE.Mesh(new THREE.BoxGeometry(SL.len, 6, slipW + 1.2), std(0x4b4a42, 0.95));   // the masonry under it (wet, dark: s31 r2 read as a flat grey slab)
    fill.position.set(slipX0 + SL.len / 2, (SL.top + SL.toe) / 2 - 3.8, slipZ); fill.rotation.z = -ang; dress.add(fill);
    for (const s of [-1, 1]) {
      const k = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5, 0.6), stoneDark);
      k.position.set(slipX0 + SL.len / 2, (SL.top + SL.toe) / 2 + 0.05, slipZ + s * (slipW / 2 + 0.3)); k.rotation.z = -ang; dress.add(k);
    }
    for (const s of [-1.6, 1.6]) {
      const sk = new THREE.Mesh(new THREE.BoxGeometry(len * 0.9, 0.1, 0.22), woodDark);
      sk.position.set(slipX0 + SL.len * 0.47, (SL.top + SL.toe) / 2 + 0.06 + 0.02, slipZ + s); sk.rotation.z = -ang; dress.add(sk);
    }
    const apron = new THREE.Mesh(new THREE.BoxGeometry(5, 0.4, slipW + 1.2), stone);       // the head of the slip
    apron.position.set(slipX0 - 2.5, SL.top - 0.2, slipZ); dress.add(apron);
  }
  // boats hauled out by the slipway (resting on the ground, a little heeled)
  const paints = [0x3f5b6b, 0x7a3a2a, 0x58663c, 0x6b5a3e, 0x2f4a5a];
  HB.hauled.forEach(([[x, z], h], i) => {
    const b = makeBoat(5.6, 1.9, paints[i % paints.length], 40 + i);
    b.position.set(x, ground(x, z) + 0.62, z); b.rotation.set(0.12 * (i ? -1 : 1), Math.PI / 2 - h * Math.PI / 180, 0);
    dress.add(b);
  });
  // the hauling boats (set objects; keyed per shot)
  const boatA = makeBoat(6.2, 2.0, 0x3f5b6b, 7), boatB = makeBoat(6.0, 2.0, 0x7a3a2a, 8);
  boatA.name = 'boatA'; boatB.name = 'boatB';
  boatA.position.set(300, 0, 1705); boatB.position.set(301, 0, 1726);
  scene.add(boatA, boatB);
  // the hauled net + haul line (rebuilt per frame when a shot keys the boats)
  const ntex = netTexture();
  if (ntex) ntex.repeat.set(10, 3);
  const netMat = new THREE.MeshStandardMaterial({ color: 0xffffff, map: ntex, alphaMap: null, transparent: false, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 });
  if (ntex) netMat.alphaMap = ntex;
  const NU = 16, NV = 6;
  const netGeo = new THREE.BufferGeometry();
  netGeo.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array((NU + 1) * (NV + 1) * 3), 3));
  { const uv = [], ix = [];
    for (let i = 0; i <= NU; i++) for (let j = 0; j <= NV; j++) uv.push(i / NU, j / NV);
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; ix.push(a, b, a + 1, b, b + 1, a + 1); }
    netGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); netGeo.setIndex(ix); }
  const net = new THREE.Mesh(netGeo, netMat); net.name = 'net'; net.castShadow = true; net.frustumCulled = false;
  const floatMat = std(0xb89a5a, 0.7);
  const floats = Array.from({ length: 9 }, () => { const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 8, 6), floatMat); f.castShadow = true; return f; });
  const ropeMat = std(0x8a7656, 0.9);
  const segs = (n) => Array.from({ length: n }, () => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1, 5), ropeMat); m.castShadow = true; m.frustumCulled = false; return m; });
  const haul = segs(10), haul2 = segs(8);
  const netGroup = new THREE.Group(); netGroup.add(net, ...floats, ...haul, ...haul2); netGroup.visible = false;
  scene.add(netGroup);
  const up = new THREE.Vector3(0, 1, 0), tmp = new THREE.Vector3();
  function rope(list, a, b, sag) {
    const n = list.length;
    const P = (k) => { const u = k / n; return new THREE.Vector3(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - sag * 4 * u * (1 - u), a.z + (b.z - a.z) * u); };
    for (let k = 0; k < n; k++) {
      const p = P(k), q = P(k + 1), m = list[k];
      m.position.copy(p).add(q).multiplyScalar(0.5);
      tmp.subVectors(q, p); m.scale.set(1, Math.max(tmp.length(), 0.01), 1);
      m.quaternion.setFromUnitVectors(up, tmp.normalize());
    }
  }
  function layNet(pa, pb, mouth) {
    // the net's top rope runs from boatA's inboard quarter to boatB's, bowing toward the slipway (mouth);
    // the bag hangs below the surface, deepest in the middle
    const p = netGeo.attributes.position;
    for (let i = 0; i <= NU; i++) {
      const u = i / NU, bow = Math.sin(Math.PI * u);
      const x = pa.x + (pb.x - pa.x) * u + mouth[0] * bow, z = pa.z + (pb.z - pa.z) * u + mouth[1] * bow;
      for (let j = 0; j <= NV; j++) {
        const v = j / NV;
        p.setXYZ(i * (NV + 1) + j, x + 1.4 * v * bow, 0.65 - v * (0.6 + 1.4 * bow), z);
      }
      if (i % 2 === 0) floats[i / 2]?.position.set(x, 0.62, z);
    }
    p.needsUpdate = true; netGeo.computeVertexNormals(); netGeo.computeBoundingSphere();
    return new THREE.Vector3(pa.x + (pb.x - pa.x) * 0.5 + mouth[0], 0.65, pa.z + (pb.z - pa.z) * 0.5 + mouth[1]);
  }

  // drying net on a frame south of the slipway
  {
    const [a, b] = HB.dryNet;
    for (const [x, z] of [a, b]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 2.6, 6), wood); p.position.set(x, ground(x, z) + 1.3, z); dress.add(p); }
    const span = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const t2 = ntex ? ntex.clone() : null; if (t2) { t2.repeat.set(span * 1.4, 3); t2.needsUpdate = true; }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(span, 2.1, 8, 3), new THREE.MeshStandardMaterial({ color: 0xffffff, map: t2, alphaMap: t2, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.95 }));
    const pp = m.geometry.attributes.position;
    for (let i = 0; i < pp.count; i++) { const xx = pp.getX(i), yy = pp.getY(i); pp.setY(i, yy - 0.25 * (1 - (2 * xx / span) ** 2) * (yy + 1.05) / 2.1); }
    m.geometry.computeVertexNormals();
    m.position.set((a[0] + b[0]) / 2, ground(a[0], a[1]) + 1.45, (a[1] + b[1]) / 2);
    m.rotation.y = Math.atan2(-(b[1] - a[1]), b[0] - a[0]);
    m.castShadow = true; dress.add(m);
  }
  // the catch: wicker baskets of fish + a heap on the stones
  const wicker = std(0x8a6a3e, 0.95, { side: THREE.DoubleSide }), fishMat = std(0x9aa3a6, 0.35, { metalness: 0.25 });
  const fishGeo = new THREE.SphereGeometry(1, 8, 5);
  const fishes = [];
  const rf = rand(77);
  const addFish = (x, y, z, n, spread) => { for (let i = 0; i < n; i++) fishes.push([x + (rf() - 0.5) * spread, y + rf() * 0.06, z + (rf() - 0.5) * spread, rf() * 6.28]); };
  HB.catch.forEach(([x, z], i) => {
    const y = ground(x, z), h = 0.42 + 0.06 * (i % 2);
    const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.27, h, 14, 1, true), wicker); bk.position.set(x, y + h / 2, z); dress.add(bk);
    const bt = new THREE.Mesh(new THREE.CircleGeometry(0.27, 14), wicker); bt.rotation.x = -Math.PI / 2; bt.position.set(x, y + 0.02, z); dress.add(bt);
    const rimm = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.025, 5, 16), wicker); rimm.rotation.x = Math.PI / 2; rimm.position.set(x, y + h, z); dress.add(rimm);
    addFish(x, y + h - 0.06, z, 9, 0.45);
  });
  { const [x, z] = HB.heap, y = ground(x, z); addFish(x, y + 0.04, z, 40, 1.1); addFish(x, y + 0.12, z, 14, 0.6); }
  if (fishes.length) {
    const im = new THREE.InstancedMesh(fishGeo, fishMat, fishes.length);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(0.17, 0.035, 0.05);
    fishes.forEach(([x, y, z, r], i) => { q.setFromEuler(new THREE.Euler(0, r, (r % 1) * 0.3)); m4.compose(new THREE.Vector3(x, y, z), q, s); im.setMatrixAt(i, m4); });
    im.castShadow = true; dress.add(im);
  }
  // crates / barrels on the quay
  HB.crates.forEach(([x, z], i) => {
    const y = ground(x, z);
    const m = i % 2 ? new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.36, 0.85, 12), woodDark) : new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.6, 0.6), wood);
    m.position.set(x, y + (i % 2 ? 0.425 : 0.3), z); m.rotation.y = i * 0.7; dress.add(m);
  });
  // market stalls on the terrace-1 street: counter, posts, a sagging cloth roof (facing the street = west)
  {
    const dyes = [0xa8853e, 0x8a3f30, 0x5a6a7c, 0xcbbd9c, 0x6d7a45, 0x9a6a3a];
    const goods = [0xb5492f, 0xd0a040, 0x6f8a3a, 0x8c6b4a, 0xc9c0a8];
    const rs = rand(31);
    HB.stalls.forEach(([x, z], i) => {
      const y = ground(x, z), face = x > 200 ? -1 : 1;     // the counter on the street side
      const W = 2.6, D = 1.6;
      const g = new THREE.Group(); g.position.set(x, y, z); if (face > 0) g.rotation.y = Math.PI;
      const counter = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.95, W), wood); counter.position.set(-D / 2 + 0.4, 0.475, 0); g.add(counter);
      for (const [px, pz, ph] of [[-D / 2, -W / 2, 2.25], [-D / 2, W / 2, 2.25], [D / 2, -W / 2, 2.6], [D / 2, W / 2, 2.6]]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, ph, 6), woodDark); p.position.set(px, ph / 2, pz); g.add(p);
      }
      const roof = new THREE.PlaneGeometry(D + 0.6, W + 0.3, 6, 6);
      const rp = roof.attributes.position;
      for (let k = 0; k < rp.count; k++) { const a = rp.getX(k) / ((D + 0.6) / 2), b = rp.getY(k) / ((W + 0.3) / 2); rp.setZ(k, -0.12 * (1 - a * a) * (1 - b * b)); }
      roof.computeVertexNormals();
      const cloth = new THREE.Mesh(roof, std(dyes[i % dyes.length], 0.95, { side: THREE.DoubleSide }));
      roof.rotateX(-Math.PI / 2); cloth.rotation.z = Math.atan2(0.35, D); cloth.position.set(0, 2.45, 0); g.add(cloth);
      for (let k = 0; k < 7; k++) {                       // goods heaped on the counter
        const s = 0.12 + rs() * 0.1;
        const gm = new THREE.Mesh(rs() < 0.5 ? new THREE.SphereGeometry(s, 8, 6) : new THREE.BoxGeometry(s * 2, s * 1.2, s * 2), std(goods[(i + k) % goods.length], 0.8));
        gm.position.set(-D / 2 + 0.4 + (rs() - 0.5) * 0.5, 0.95 + s * 0.6, (rs() - 0.5) * (W - 0.4)); g.add(gm);
      }
      const bk = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.24, 0.4, 12, 1, true), wicker); bk.position.set(-D / 2 - 0.35, 0.2, W / 2 - 0.3); g.add(bk);
      dress.add(g);
    });
  }
  // the market street paving (terrace 1): a strip of worn flags following the ground (the terrain there is turf)
  if (HB.street) {
    const [x0, x1] = HB.street.x, [z0, z1] = HB.street.z;
    const sg = new THREE.PlaneGeometry(x1 - x0, z1 - z0, Math.ceil((x1 - x0) / 1.5), Math.ceil((z1 - z0) / 1.5));
    sg.rotateX(-Math.PI / 2);
    const sp = sg.attributes.position, cols = [];
    const rc = rand(5);
    for (let k = 0; k < sp.count; k++) {
      const x = sp.getX(k) + (x0 + x1) / 2, z = sp.getZ(k) + (z0 + z1) / 2;
      sp.setXYZ(k, x, base.ground(x, z) + 0.05, z);
      const v = 0.8 + 0.2 * rc(); cols.push(v * 0.3, v * 0.285, v * 0.26);   // linear (s31 r2: 0.6 read as white)
    }
    sg.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3)); sg.computeVertexNormals();
    const street = new THREE.Mesh(sg, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.92 }));
    street.receiveShadow = true; dress.add(street);
  }
  dress.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(dress);

  const shadowDragon = (() => {
    const sh = new THREE.Shape();
    const S2 = 1.0;   // Charcoal: ~36 m nose to tail, ~34 m span
    const pts = [[0, 18], [1.2, 13], [2.2, 6], [17, 9], [15, 4], [16.5, 0], [13, -2], [11, -6], [2.4, -3], [1.2, -10], [0.5, -16], [0, -18]];
    sh.moveTo(0, pts[0][1] * S2);
    for (const [x, y] of pts.slice(1)) sh.lineTo(x * S2, y * S2);
    for (const [x, y] of pts.slice(0, -1).reverse()) sh.lineTo(-x * S2, y * S2);
    const g = new THREE.ShapeGeometry(sh); g.rotateX(Math.PI / 2);          // shape y -> world +z (forward)
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false, side: THREE.DoubleSide }));
    m.castShadow = true; m.receiveShadow = false; m.visible = false; m.name = 'shadowDragon'; m.frustumCulled = false;
    scene.add(m);
    return m;
  })();
  const objects = { ...(base.objects || {}), boatA, boatB, net, shadowDragon };
  const boats = { boatA, boatB };
  let netOn = false;
  return {
    ...base,
    ground,
    objects,
    /** an actor aboard a boat stands on its floor boards */
    groundIn: (parent) => (boats[parent] ? 0.02 : 0),
    marks: { ...base.marks, slipwayTop: [slipX0, SL.top, slipZ], slipwayFoot: [slipX1, SL.toe, slipZ] },
    applyShot(info) {
      base.applyShot(info);
      const st = info.spec.set || {}, t = info.local;
      // the hauling boats: [x, z, heading] keys per shot (hidden when the shot does not key them)
      for (const [n, b] of Object.entries(boats)) {
        const k = st.boats?.[n];
        b.visible = !!k;
        if (!k) continue;
        const [x, z, h] = keyed(t, k);
        b.position.set(x, 0.28 + 0.04 * Math.sin(1.3 * info.t + x), z);
        b.rotation.set(0.035 * Math.sin(1.1 * info.t + z), Math.PI / 2 - h * Math.PI / 180, 0.02 * Math.sin(0.9 * info.t + x));
        b.updateMatrixWorld(true);
      }
      netOn = !!(st.net && st.boats?.boatA && st.boats?.boatB);
      netGroup.visible = netOn;
    },
    afterCast(info) {
      if (!netOn) return;
      const st = info.spec.set, t = info.local;
      const pa = new THREE.Vector3(-1.6, 0.3, 0.6).applyMatrix4(boatA.matrixWorld);
      const pb = new THREE.Vector3(-1.6, 0.3, -0.6).applyMatrix4(boatB.matrixWorld);
      const mouthPt = layNet(pa, pb, st.net.mouth || [-3, 0]);
      const to = st.haul ? info.env.point(st.haul, t) : null;
      haul.forEach((m) => { m.visible = !!to; });
      if (to) rope(haul, mouthPt, to, 0.25);
      const hold = st.haul2 ? (typeof st.haul2 === 'string' ? info.env.point(st.haul2, t) : new THREE.Vector3(...st.haul2)) : null;
      haul2.forEach((m) => { m.visible = !!hold; });
      if (hold) rope(haul2, new THREE.Vector3(-2.6, 0.45, 0).applyMatrix4(boatB.matrixWorld), hold, 0.35);
    },
    dynamic() { return [...[boatA, boatB].filter((b) => b.visible), ...(netOn ? [netGroup] : [])]; },
  };
}
