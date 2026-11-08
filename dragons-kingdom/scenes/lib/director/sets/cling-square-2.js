// Shot director set - CLING_SQUARE_2: the rest of the Cling square in scene 1C (X5-10..18, R3-01..04), a second spec
// on the CLING_SQUARE shots (registry `shotSet`).
//
// A THIN WRAPPER over CLING_SQUARE (sets/cling-square.js, its build() as-is: the square, the land, the stall, the
// ladder, the dais, the watchman's platform, the pigeons, the sun), so the two specs can never disagree about the
// square. sets/cling-square.js is NOT edited (shots queued on it keep their keys). This file adds, all procedural:
//   house by the arch   the west-row door nearest DOOR (south of the stone arch): the house's own door leaf and the
//                       painted room behind it are dropped (triangles in the opening), a hinged plank leaf (`set.door`
//                       0 shut .. 1 open, keys) and a ROOM behind it (floor, lime-washed walls, ceiling, a table, a
//                       shelf; `set.room.lamp` = a warm light inside); `ground` returns the floor in the room
//   parcel              a cloth-wrapped parcel with a knot on the table (`set.parcel`: keys of [lat, y, dep] in the
//                       DOOR frame: lat + = north (screen right from the square), dep + = into the house)
//   banner              the first festival banner on a rope from a north-row house front to the fountain pillar:
//                       `set.banner: { unroll: keys 0..1, lift: keys 0..1 }` (a roll slides down the rope paying out
//                       the cloth, then the breeze lifts it)
//   lute, luteLap       the musician's lute (hand prop, `holds`) and a second one laid across his knees
//                       (`set.luteLap: [x, y, z, yawDeg]`)
//   pipe                a small clay pipe (hand prop, `holds`; the smoke is the FX library's smoke-wisp)
//   flock               a few birds wheeling far off (`set.flock: { c: [x, y, z], r, n }`) for the watchman's view
// DOOR frame (spec helpers D / D3): origin = the door's centre on the front face at the paving, lat along the front
// (north +), y up, dep into the house (west).
import * as THREE from 'three';
import * as base from './cling-square.js';
import { keyed } from '../timeline.js';

export const cinematic = base.cinematic;
export const DOOR = [-19.81, 21.68];               // the door picked (west row, 5 m south of the arch: architecture layout)
const PAVE = 0.03;
const K = (v, t) => keyed(t, v);
const ROOM = { lat0: -1.8, lat1: 1.8, dep0: 0.5, dep1: 3.7, h: 2.75 };
const std = (color, rough = 0.9, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0, ...o });

function canvasTex(w, h, draw) {
  if (typeof document === 'undefined') return null;
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export async function build(ctx, opts = {}) {
  const { scene } = ctx;
  const before = new Set(scene.children);
  const B = await base.build(ctx, opts);
  const added = scene.children.filter((o) => !before.has(o));

  // ---------------------------------------------------------------- the door
  let best = null;
  for (const h of B.houses || []) {
    if (h.back || h.passage || !h.doors?.length || h.side !== 'west') continue;
    for (const d of h.doors) {
      const F = h.frame;
      const p = [F[0] + d.x * F[3] + d.z * F[9], 0, F[2] + d.x * F[5] + d.z * F[11]];
      const dist = Math.hypot(p[0] - DOOR[0], p[2] - DOOR[1]);
      if (!best || dist < best.dist) best = { h, d, p, dist };
    }
  }
  const W = best ? best.d.w : 1.11, H = best ? best.d.h : 2.49;
  const F = best?.h.frame;
  const ex = new THREE.Vector3(...(F ? [F[3], F[4], F[5]] : [0.023, 0, -1])).normalize();
  const ez = new THREE.Vector3(...(F ? [F[9], F[10], F[11]] : [1, 0, 0.023])).normalize();
  const up = new THREE.Vector3(0, 1, 0);
  const P0 = new THREE.Vector3(...(best ? best.p : [DOOR[0], 0, DOOR[1]]));
  /** door frame -> world */
  const D3 = (lat, y, dep) => P0.clone().addScaledVector(ex, lat).addScaledVector(up, y).addScaledVector(ez, -dep);
  const local = (v) => { const d = v.clone().sub(P0); return [d.dot(ex), d.y, -d.dot(ez)]; };
  const spring = H - W / 2, rIn = W / 2 - 0.04;
  const inOpening = (lat, y, dep) => Math.abs(lat) < W / 2 - 0.035 && y > 0.04 && dep > 0.02 && dep < 2.2 && (y < spring - 0.02 || lat * lat + (y - spring) ** 2 < rIn * rIn);
  const inRoom = (lat, y, dep) => lat > ROOM.lat0 + 0.05 && lat < ROOM.lat1 - 0.05 && y > 0.01 && y < ROOM.h - 0.02 && dep > ROOM.dep0 - 0.02 && dep < ROOM.dep1 - 0.05;
  // drop the house's own leaf + painted room: triangles with a vertex (or the centroid) in the opening, or wholly in the room
  {
    const v = new THREE.Vector3(), c = new THREE.Vector3(), sph = new THREE.Sphere();
    const hit = (m, I, P, i) => {
      c.set(0, 0, 0);
      let any = false, all = true;
      for (let k = 0; k < 3; k++) {
        v.fromBufferAttribute(P, I[i + k]).applyMatrix4(m.matrixWorld); c.add(v);
        const l = local(v);
        if (inOpening(...l)) any = true;
        if (!inRoom(...l)) all = false;
      }
      return any || all || inOpening(...local(c.multiplyScalar(1 / 3)));
    };
    for (const root of added) {
      root.updateMatrixWorld(true);
      root.traverse((m) => {
        if (!m.isMesh || m.isInstancedMesh || !m.geometry?.attributes.position) return;
        const g = m.geometry;
        if (!g.boundingSphere) g.computeBoundingSphere();
        sph.copy(g.boundingSphere).applyMatrix4(m.matrixWorld);
        if (sph.center.distanceTo(P0) > sph.radius + 4.5) return;
        if (!g.index) {                                   // non-indexed (the painted room portal): collapse the triangles
          const P = g.attributes.position, seq = Array.from({ length: P.count }, (_, i) => i);
          let n = 0;
          for (let i = 0; i + 2 < P.count; i += 3) if (hit(m, seq, P, i)) { for (let k = 1; k < 3; k++) P.setXYZ(i + k, P.getX(i), P.getY(i), P.getZ(i)); n++; }
          if (n) { P.needsUpdate = true; g.computeBoundingSphere(); }
          return;
        }
        const P = g.attributes.position, I = g.index.array, keep = [];
        for (let i = 0; i < I.length; i += 3) if (!hit(m, I, P, i)) keep.push(I[i], I[i + 1], I[i + 2]);
        if (keep.length !== I.length) { g.setIndex(keep); g.computeBoundingSphere(); }
      });
    }
  }
  // the door frame group: x = lat, y up, z = -dep (out of the house)
  const doorG = new THREE.Group();
  doorG.position.copy(P0);
  doorG.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(ex, up, ez));
  scene.add(doorG);
  const planks = canvasTex(256, 512, (g, w, h) => {
    const n = 6;
    for (let i = 0; i < n; i++) { const k = 0.85 + 0.3 * ((i * 37) % 7) / 7; g.fillStyle = `rgb(${Math.round(78 * k)},${Math.round(56 * k)},${Math.round(38 * k)})`; g.fillRect((i * w) / n, 0, w / n, h); }
    g.fillStyle = 'rgba(20,12,6,0.85)'; for (let i = 1; i < n; i++) g.fillRect((i * w) / n - 1.5, 0, 3, h);
    g.globalAlpha = 0.12; for (let y = 0; y < h; y += 3) { g.fillStyle = y % 6 ? '#2a1a0c' : '#a07850'; g.fillRect(0, y, w, 1); }
  });
  const oak = std(0x4d3826, 0.82, planks ? { map: planks } : {});
  const iron = std(0x1d1b19, 0.55, { metalness: 0.6 });
  const lw = W - 0.03;
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0); leafShape.lineTo(lw, 0); leafShape.lineTo(lw, spring);
  leafShape.absarc(lw / 2, spring, lw / 2, 0, Math.PI, false); leafShape.lineTo(0, 0);
  const leafGeo = new THREE.ExtrudeGeometry(leafShape, { depth: 0.05, bevelEnabled: false, curveSegments: 16 });
  { const uv = leafGeo.attributes.uv, P = leafGeo.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, P.getX(i) / lw, P.getY(i) / H); }
  const hingeG = new THREE.Group();                  // at the south jamb, 0.2 m in
  hingeG.position.set(-W / 2 + 0.015, 0.02, -0.2);
  doorG.add(hingeG);
  const swing = new THREE.Group(); hingeG.add(swing);
  const leaf = new THREE.Mesh(leafGeo, oak); leaf.position.z = -0.025; swing.add(leaf);
  for (const y of [0.3, 1.45]) { const s = new THREE.Mesh(new THREE.BoxGeometry(lw * 0.8, 0.05, 0.012), iron); s.position.set(lw * 0.4, y, 0.032); swing.add(s); }
  { const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.008, 6, 16), iron); ring.position.set(lw * 0.85, 1.0, 0.04); swing.add(ring); }
  swing.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });

  // ---------------------------------------------------------------- the room
  const plaster = std(0xb5a78f, 0.95), floorM = std(0x5d5448, 0.9), beamM = std(0x3a2c20, 0.85);
  const box = (sx, sy, sz, m, x, y, z, parent = doorG) => { const o = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m); o.position.set(x, y, z); o.castShadow = true; o.receiveShadow = true; parent.add(o); return o; };
  const RW = ROOM.lat1 - ROOM.lat0, RD = ROOM.dep1 - ROOM.dep0, rc = (ROOM.lat0 + ROOM.lat1) / 2, dc = -(ROOM.dep0 + ROOM.dep1) / 2;
  box(RW, 0.04, RD + 0.4, floorM, rc, 0.01, dc + 0.2);                                  // floor (into the doorway)
  box(RW, ROOM.h, 0.08, plaster, rc, ROOM.h / 2, -ROOM.dep1);                            // back wall
  box(0.08, ROOM.h, RD, plaster, ROOM.lat0, ROOM.h / 2, dc);                             // side walls
  box(0.08, ROOM.h, RD, plaster, ROOM.lat1, ROOM.h / 2, dc);
  box(RW, 0.08, RD, plaster, rc, ROOM.h, dc);                                            // ceiling + beams
  for (const d of [1.2, 2.3, 3.3]) box(RW, 0.14, 0.12, beamM, rc, ROOM.h - 0.1, -d);
  // the inner face of the front wall round the opening, and liners in the reveal
  const sideW = -(W / 2 + 0.02) - ROOM.lat0;
  box(sideW, ROOM.h, 0.08, plaster, ROOM.lat0 + sideW / 2, ROOM.h / 2, -ROOM.dep0);
  box(ROOM.lat1 - (W / 2 + 0.02), ROOM.h, 0.08, plaster, (ROOM.lat1 + W / 2 + 0.02) / 2, ROOM.h / 2, -ROOM.dep0);
  box(W + 0.06, ROOM.h - H, 0.08, plaster, 0, H + (ROOM.h - H) / 2, -ROOM.dep0);
  for (const s of [-1, 1]) box(0.03, H, 0.34, plaster, s * (W / 2 + 0.012), H / 2, -0.36);
  // table, bench, shelf with crocks
  const TABLE = { lat: 0, dep: 1.4, h: 0.76, w: 1.1, d: 0.62 };
  const tableG = new THREE.Group(); tableG.position.set(TABLE.lat, 0, -TABLE.dep); doorG.add(tableG);
  box(TABLE.w, 0.05, TABLE.d, std(0x6a5038, 0.8), 0, TABLE.h - 0.025, 0, tableG);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.06, TABLE.h - 0.05, 0.06, beamM, sx * (TABLE.w / 2 - 0.07), (TABLE.h - 0.05) / 2, sz * (TABLE.d / 2 - 0.07), tableG);
  box(1.0, 0.04, 0.3, std(0x5a4430, 0.85), 0.2, 0.44, -0.75, tableG);
  for (const sx of [-0.25, 0.65]) box(0.05, 0.42, 0.25, beamM, sx, 0.21, -0.75, tableG);
  box(1.3, 0.04, 0.26, beamM, 0.6, 1.55, -ROOM.dep1 + 0.15);
  const crock = std(0x7a5a3e, 0.6);
  for (const [x, r, hh] of [[0.15, 0.07, 0.16], [0.4, 0.09, 0.2], [0.7, 0.06, 0.13], [1.0, 0.08, 0.18]]) {
    const o = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, hh, 12), crock); o.position.set(x, 1.57 + hh / 2, -ROOM.dep1 + 0.15); o.castShadow = true; doorG.add(o);
  }
  // a cloth and a loaf on the table (dressing)
  box(0.42, 0.006, 0.4, std(0xcfc2a6, 0.95), -0.28, TABLE.h + 0.003, 0.02, tableG);
  const lamp = new THREE.PointLight(0xffc48a, 0, 4.2, 1.6);
  lamp.position.set(0.9, 2.1, -2.6); doorG.add(lamp);

  // the parcel: a loaf-sized bundle in undyed cloth, a knot on top (door frame keys)
  const linen = std(0xd6cbb3, 0.95);
  const parcel = new THREE.Group();
  {
    const g = new THREE.BoxGeometry(0.26, 0.11, 0.19, 6, 3, 5), P = g.attributes.position;
    for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i); const r = 1 - 0.18 * Math.max(0, y / 0.055) * (Math.abs(x) / 0.13 + Math.abs(z) / 0.095) / 2; P.setXYZ(i, x * r, y + 0.055 + 0.01 * Math.sin(x * 40) * Math.cos(z * 30), z * r); }
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, linen); parcel.add(m);
    const knot = new THREE.Mesh(new THREE.SphereGeometry(0.03, 10, 8), linen); knot.scale.set(1.3, 0.8, 1); knot.position.set(0, 0.118, 0); parcel.add(knot);
    for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6), linen); e.position.set(s * 0.04, 0.125, 0.01); e.rotation.z = s * -1.1; parcel.add(e); }
    parcel.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  doorG.add(parcel);

  // ---------------------------------------------------------------- the lute (twice) and the pipe
  const makeLute = () => {
    const g = new THREE.Group();
    const wood = std(0x5a3a1e, 0.5), dark = std(0x2a1a10, 0.6), top = std(0xb08a58, 0.6);
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14), wood); body.scale.set(0.17, 0.125, 0.075); body.position.set(0.12, 0, 0); g.add(body);
    const board = new THREE.Mesh(new THREE.CircleGeometry(1, 24), top); board.scale.set(0.17, 0.125, 1); board.position.set(0.12, 0, 0.076); g.add(board);
    const rose = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), dark); rose.position.set(0.08, 0, 0.083); g.add(rose);
    const neck = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.03), dark); neck.position.set(-0.22, 0, 0.06); g.add(neck);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.045, 0.025), dark); head.position.set(-0.41, 0, 0.02); head.rotation.y = -0.9; g.add(head);
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.07, 0.01), dark); bridge.position.set(0.2, 0, 0.086); g.add(bridge);
    for (let i = 0; i < 4; i++) { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.0009, 0.0009, 0.58, 3), std(0xd8d0c0, 0.4)); s.rotation.z = Math.PI / 2; s.position.set(-0.08, -0.015 + i * 0.01, 0.087); g.add(s); }
    g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    scene.add(g);
    return g;
  };
  const lute = makeLute(), luteLap = makeLute();
  lute.visible = false; luteLap.visible = false;
  const pipe = new THREE.Group();
  {
    const clay = std(0x9e9484, 0.55), char = std(0x0d0b09, 0.9);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0055, 0.11, 8), clay); stem.rotation.z = Math.PI / 2; stem.position.set(0.02, 0, 0);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.007, 0.032, 10, 1, true), clay); bowl.position.set(-0.04, 0.015, 0);
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.0095, 10), char); ash.rotation.x = -Math.PI / 2; ash.position.set(-0.04, 0.028, 0);
    pipe.add(stem, bowl, ash); pipe.traverse((o) => { if (o.isMesh) o.castShadow = true; }); pipe.visible = false; scene.add(pipe);
  }

  // ---------------------------------------------------------------- the banner on its rope
  const BAN = { A: new THREE.Vector3(3.0, 5.4, -17.45), B: new THREE.Vector3(0.0, 3.25, -2.0), sag: 0.45, H: 0.95, NU: 64, NV: 10 };
  const ropeAt = (s) => BAN.A.clone().lerp(BAN.B, s).add(new THREE.Vector3(0, -BAN.sag * 4 * s * (1 - s), 0));
  const LEN = BAN.A.distanceTo(BAN.B);
  const ropeM = std(0x8a7a5e, 0.9);
  const rope = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 21 }, (_, i) => ropeAt(i / 20))), 60, 0.009, 5), ropeM);
  rope.castShadow = true; scene.add(rope); rope.visible = false;
  const banTex = canvasTex(1024, 128, (g, w, h) => {
    g.fillStyle = '#b5852f'; g.fillRect(0, 0, w, h);                                   // ochre field
    g.fillStyle = '#3d5a78'; g.fillRect(0, 0, w, h * 0.18); g.fillRect(0, h * 0.82, w, h * 0.18);   // faded woad bands
    g.fillStyle = '#e4d9c0';
    for (let x = 24; x < w; x += 64) { g.beginPath(); g.moveTo(x, h * 0.5 - 22); g.lineTo(x + 18, h * 0.5); g.lineTo(x, h * 0.5 + 22); g.lineTo(x - 18, h * 0.5); g.closePath(); g.fill(); }
    g.fillStyle = 'rgba(60,40,20,0.18)'; for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1, h);
  });
  if (banTex) { banTex.wrapS = THREE.RepeatWrapping; banTex.repeat.set(LEN / 4, 1); }
  const clothM = std(0xffffff, 0.92, { side: THREE.DoubleSide, ...(banTex ? { map: banTex } : { color: 0xb5852f }) });
  const banGeo = new THREE.PlaneGeometry(1, 1, BAN.NU, BAN.NV);
  const banner = new THREE.Mesh(banGeo, clothM); banner.castShadow = true; banner.receiveShadow = true; banner.frustumCulled = false; scene.add(banner); banner.visible = false;
  const roll = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, BAN.H, 14), clothM); roll.castShadow = true; scene.add(roll); roll.visible = false;
  const horiz = new THREE.Vector3().subVectors(BAN.B, BAN.A).setY(0).normalize();
  const NRM = new THREE.Vector3(horiz.z, 0, -horiz.x);                 // horizontal normal of the banner (east-ish side)
  if (NRM.x < 0) NRM.multiplyScalar(-1);

  // ---------------------------------------------------------------- far birds
  const birdM = std(0x1a1816, 0.9, { side: THREE.DoubleSide });
  const flock = Array.from({ length: 6 }, () => {
    const g = new THREE.Group();
    const wingGeo = new THREE.BufferGeometry(); wingGeo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.08, 0, 0, 0.1, 0.42, 0, 0.02], 3)); wingGeo.computeVertexNormals();
    const L = new THREE.Mesh(wingGeo, birdM), R = new THREE.Mesh(wingGeo, birdM); R.scale.x = -1;
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.05, 6, 4), birdM); body.scale.set(1, 0.8, 2.6);
    g.add(L, R, body); g.userData = { L, R }; g.visible = false; scene.add(g); return g;
  });

  const ground = (x, z) => {
    const [lat, , dep] = local(new THREE.Vector3(x, 0, z));
    if (lat > ROOM.lat0 && lat < ROOM.lat1 && dep > -0.05 && dep < ROOM.dep1) return PAVE;
    return B.ground(x, z);
  };
  const tableTop = D3(TABLE.lat, TABLE.h, TABLE.dep);
  const marks = {
    ...B.marks,
    door: D3(0, 1.2, 0).toArray(), doorStep: D3(0, PAVE, -0.3).toArray(), table: tableTop.toArray(),
    banner: ropeAt(0.5).toArray(), bannerA: BAN.A.toArray(), bannerB: BAN.B.toArray(),
  };
  const _v = new THREE.Vector3();

  return {
    ...B,
    marks,
    ground,
    objects: { ...B.objects, doorLeaf: swing, parcel, lute, luteLap, pipe, banner, table: tableG },
    applyShot(info) {
      B.applyShot(info);
      const st = info.spec.set || {}, t = info.local;
      // door + lamp
      const open = Math.min(1, Math.max(0, K(st.door ?? 0, t)));
      swing.rotation.y = open * 1.72;
      swing.updateMatrixWorld(true);
      lamp.intensity = K(st.room?.lamp ?? 0, t);
      // parcel (door frame [lat, y, dep])
      const pk = st.parcel;
      parcel.visible = !!pk;
      if (pk) { const p = K(pk, t); parcel.position.set(p[0], p[1], -p[2]); parcel.rotation.y = (p[3] || 0) * Math.PI / 180; parcel.updateMatrixWorld(true); }
      // the lute across the knees
      luteLap.visible = !!st.luteLap;
      if (st.luteLap) {
        const q = st.luteLap;
        luteLap.position.set(q[0], q[1], q[2]);
        luteLap.rotation.set(-Math.PI / 2 + (q[4] || 0) * Math.PI / 180, 0, 0, 'YXZ');
        luteLap.rotation.y = q[3] * Math.PI / 180;
        luteLap.updateMatrixWorld(true);
      }
      // banner
      const bn = st.banner;
      rope.visible = !!bn; banner.visible = !!bn; roll.visible = false;
      if (bn) {
        const u1 = Math.min(1, Math.max(0, K(bn.unroll ?? 1, t)));
        const lift = K(bn.lift ?? 0, t);
        const P = banGeo.attributes.position, UV = banGeo.attributes.uv;
        for (let j = 0; j <= BAN.NV; j++) for (let i = 0; i <= BAN.NU; i++) {
          const u = i / BAN.NU, v = j / BAN.NV, s = u * u1;
          const r = ropeAt(Math.max(0.003, s));
          const w = lift * Math.pow(v, 1.25) * (0.32 + 0.12 * Math.sin(2 * Math.PI * (0.55 * t - 2.2 * s)) + 0.06 * Math.sin(2 * Math.PI * (1.3 * t + 5 * s + v)));
          const flap = 0.025 * Math.sin(2 * Math.PI * (1.9 * t - 9 * s)) * v * (0.3 + lift);
          const k = Math.min(1, (u1 - s) * LEN / 0.6);               // the cloth near the roll hangs short (still rolled)
          _v.copy(r).addScaledVector(NRM, w + flap).add(new THREE.Vector3(0, -v * BAN.H * (0.35 + 0.65 * k) + lift * v * v * 0.18, 0));
          P.setXYZ(j * (BAN.NU + 1) + i, _v.x, _v.y, _v.z);
          UV.setXY(j * (BAN.NU + 1) + i, s, 1 - v);
        }
        P.needsUpdate = true; UV.needsUpdate = true; banGeo.computeVertexNormals(); banGeo.computeBoundingSphere();
        if (banTex) banTex.repeat.set(LEN / 4, 1);
        if (u1 < 0.999) {
          const rem = Math.sqrt(Math.max(0.02, 1 - u1)) * 0.075 + 0.012;
          roll.visible = true; roll.scale.set(rem, 1, rem);
          roll.position.copy(ropeAt(u1)).add(new THREE.Vector3(0, -BAN.H * 0.35 / 2 - 0.02, 0));
          roll.rotation.set(0, 0, 0); roll.updateMatrixWorld(true);
        }
      }
      // far birds wheeling
      const fl = st.flock;
      flock.forEach((g, i) => {
        g.visible = !!fl && i < (fl.n ?? 4);
        if (!g.visible) return;
        const ph = i * 1.7 + (fl.speed ?? 0.12) * t * (i % 2 ? 1 : -1) * 2 * Math.PI / (1 + i * 0.15);
        const r = (fl.r ?? 12) * (0.6 + 0.25 * (i % 3));
        g.position.set(fl.c[0] + Math.cos(ph) * r, fl.c[1] + 3 * Math.sin(ph * 0.7 + i) + i * 1.3, fl.c[2] + Math.sin(ph) * r);
        g.rotation.set(0, -ph + (i % 2 ? Math.PI : 0), 0.25 * (i % 2 ? 1 : -1));
        const s = fl.size ?? 1.6; g.scale.setScalar(s);
        const f = Math.sin(2 * Math.PI * (2.6 + 0.3 * i) * t + i) * 0.6;
        g.userData.L.rotation.z = f; g.userData.R.rotation.z = -f;
      });
    },
    afterCast(info, actors) { B.afterCast?.(info, actors); },
    dynamic(info) {
      const st = info.spec.set || {};
      const d = [...(B.dynamic?.(info) || [])];
      if (st.door != null) d.push(swing);
      if (st.parcel) d.push(parcel);
      if (st.banner) d.push(banner, roll);
      if (st.luteLap) d.push(luteLap);
      return d;
    },
  };
}
