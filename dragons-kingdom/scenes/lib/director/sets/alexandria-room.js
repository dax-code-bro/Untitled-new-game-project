// Shot director set - ALEXANDRIA_ROOM (Verdor palace, the queen's own room; assets-delta S1): R1-01,
// X1-02 .. X1-04 at FIRST LIGHT. "A window over the sea, an unslept bed, a sill with a wine jug and
// one cup." Built from the architecture library (washed rubble walls, flag floor, joisted ceiling, an
// arched oak door), the props library (thrown jug and cup) and a plain sea and sky outside - PROVISIONAL.
//
// MAP (VERDOR frame: +x east, -z north): the room is 5.4 m (x) by 5 m (z), floor at y 0. The WINDOW
// is in the EAST wall (x = +2.7, z 0.1..1.3, sill at 0.95 m, a deep reveal: the jug and the cup stand
// on it). The DOOR is in the NORTH wall's east end (x 1.0..2.1). The BED (made, not slept in) stands
// against the north wall in the middle. Alexandria waits at the window, back to the room; the sea lies
// below the palace (the palace stands on high ground, the sea ~40 m down).
import * as THREE from 'three';
import { Kit, frame, sub, makeRand, block, tube, xf } from '../../architecture/core.js';
import { archMaterials } from '../../architecture/materials.js';
import { masonryFace, courses } from '../../architecture/masonry.js';
import { flagFloor, beamCeiling, foldedCloths } from '../../architecture/interiors.js';
import { door as doorBuilder } from '../../architecture/openings.js';
import { verdorKit } from '../../props/verdor.js';
import { pot } from '../../props/goods.js';
import { Kit as PropKit, frame as pframe, rng as prng } from '../../props/core.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { keyed } from '../timeline.js';
import { wallFrame, skyDome, lightCard, roomEnvironment } from './common.js';

export const ROOM = { w: 5.4, d: 5.0, h: 4.0, T: 0.75 };
const WIN = { z0: 0.1, w: 1.2, y: 0.95, h: 1.9 };
const DOOR = { x0: 1.0, w: 1.1, h: 2.4 };

export function cinematic() {
  return filmFinish({
    volumetrics: {
      enabled: true, range: 20, near: 0.05, resolution: [160, 90, 48], noiseFilter: true,
      density: 0.02, heightFalloff: 0.0, fogBase: 0, anisotropy: 0.5, noiseScale: 0.6, noiseAmount: 0.45, wind: [0.01, 0.0, 0.01], shadowSoftness: 0.08,
      ambient: [0.0003, 0.00032, 0.0004], intensity: 1.0,
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.2, contactShadows: true, contactLength: 0.04, contactMaxDistance: 6 },
    dof: { samples: 48, maxCoC: 0.022 },
    grade: { exposure: 1.0, whiteBalance: 6200, contrast: 1.04, saturation: 0.88 },
    grain: { amount: 3.6 },
    lensFx: { vignette: 0.85 },
  });
}

export async function build(ctx) {
  const { scene, renderer } = ctx;
  const { w, d, h, T } = ROOM;
  const rnd = makeRand(613);
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  roomEnvironment(renderer, scene, { size: [w, h, d], wall: [0.03, 0.03, 0.032], intensity: 0.45, patches: [{ at: [w / 2, 1.9, WIN.z0 + WIN.w / 2], size: [1.2, 1.9], color: [0.7, 0.75, 0.85] }] });
  // outside: a first-light sky (the sun just under the sea horizon in the east) and the sea below
  const sky = skyDome({ zenith: [0.06, 0.08, 0.14], horizon: [0.42, 0.42, 0.46], ground: [0.05, 0.06, 0.07], glow: [0.55, 0.38, 0.28], glowDir: [1, 0.02, 0.1], glowPow: 10 });
  scene.add(sky);
  const seaEnv = (() => {
    const es = new THREE.Scene(); es.add(skyDome({ zenith: [0.06, 0.08, 0.14], horizon: [0.42, 0.42, 0.46], ground: [0.05, 0.06, 0.07], glow: [0.55, 0.38, 0.28], glowDir: [1, 0.02, 0.1], glowPow: 10, radius: 50 }));
    const pm = new THREE.PMREMGenerator(renderer); const tex = pm.fromScene(es, 0, 0.1, 100).texture; pm.dispose(); return tex;
  })();
  const seaMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.01, 0.015, 0.02), roughness: 0.14, metalness: 0, envMap: seaEnv, envMapIntensity: 1.0 });
  const sea = new THREE.Mesh(new THREE.PlaneGeometry(8000, 8000, 1, 1).rotateX(-Math.PI / 2), seaMat);
  sea.position.set(0, -42, 0); sea.receiveShadow = false;
  scene.add(sea);

  // the light of the sky through the east window (no sun yet): soft, cool, from the east and above
  const skyLight = new THREE.DirectionalLight(new THREE.Color(0.7, 0.78, 0.95), 1.1);
  skyLight.castShadow = true;
  skyLight.shadow.mapSize.set(draft ? 1024 : 2048, draft ? 1024 : 2048);
  const sc = skyLight.shadow.camera; sc.left = -5; sc.right = 5; sc.top = 5; sc.bottom = -5; sc.near = 1; sc.far = 40;
  skyLight.shadow.bias = -0.0005; skyLight.shadow.normalBias = 0.02; skyLight.shadow.radius = 6;
  skyLight.target.position.set(0, 0.5, 0.6);
  skyLight.position.copy(skyLight.target.position).addScaledVector(new THREE.Vector3(1, 0.42, 0.05).normalize(), 20);
  scene.add(skyLight, skyLight.target);
  const winFill = new THREE.PointLight(new THREE.Color(0.68, 0.74, 0.88), 0.9, 7, 2);
  winFill.position.set(w / 2 - 0.5, 1.9, WIN.z0 + WIN.w / 2);
  scene.add(winFill);

  // ---- the room
  const M = await archMaterials(ctx);
  const kit = new Kit(0);
  const C = courses(rnd, h + 0.4, { min: 0.2, max: 0.34, plinth: 0.3 });
  const face = (Fw, len, ops, seed) => masonryFace(kit, Fw, len, h + 0.4, { courses: C, style: 'washed', mat: 'stoneWashed', dressedMat: 'stonePale', mortar: 'mortarWashed', T, lod: 'mid', seed, openings: ops, back: true, backMat: 'mortarPale', quoinStart: () => 0.04, quoinEnd: () => 0.04 });
  const Fe = wallFrame([w / 2, 0, -d / 2], [0, 0, 1]);                    // east wall, running south
  face(Fe, d, [{ x: WIN.z0 + d / 2, y: WIN.y, w: WIN.w, h: WIN.h, head: 'arch', reveal: T, archDepth: T, sill: true }], 21);
  const Fs = wallFrame([w / 2, 0, d / 2], [-1, 0, 0]);                    // south wall, running west
  face(Fs, w, [], 22);
  const Fwst = wallFrame([-w / 2, 0, d / 2], [0, 0, -1]);                 // west wall, running north
  face(Fwst, d, [], 23);
  const Fn = wallFrame([-w / 2, 0, -d / 2], [1, 0, 0]);                   // north wall, running east
  face(Fn, w, [{ x: DOOR.x0 + w / 2, y: 0, w: DOOR.w, h: DOOR.h, head: 'arch', reveal: T * 0.6 }], 24);
  flagFloor(kit, frame([0, 0, 0]), w, d, rnd, {});
  beamCeiling(kit, frame([0, 0, 0]), w, d, h, rnd);
  // the bed against the north wall: a joined oak frame, a straw mattress, linen, a folded wool blanket, a bolster
  {
    const bx = -0.55, bz0 = -d / 2 + 0.06, L = 2.05, W = 1.45;
    const oak = (x, y, z, sx, sy, sz) => block(kit.get('oakDark'), sub(frame([0, 0, 0]), [x, y, z]), sx, sy, sz, { r: 0.008, rs: 1, seg: [0.3, 0.1, 0.3], seed: rnd(), noise: 0.0015, chip: 0.006 });
    oak(bx, 0.55, bz0 + 0.04, W + 0.12, 1.1, 0.08);                           // headboard
    oak(bx, 0.3, bz0 + L, W + 0.12, 0.6, 0.07);                               // footboard
    for (const sx of [-1, 1]) oak(bx + sx * (W / 2 + 0.03), 0.32, bz0 + L / 2, 0.07, 0.22, L);   // side rails
    for (const [sx, sz] of [[-1, 0], [1, 0], [-1, 1], [1, 1]]) oak(bx + sx * (W / 2 + 0.03), sz ? 0.32 : 0.6, bz0 + 0.04 + sz * (L - 0.04), 0.09, sz ? 0.64 : 1.2, 0.09);
    block(kit.get('linen'), sub(frame([0, 0, 0]), [bx, 0.5, bz0 + L / 2 + 0.03]), W - 0.02, 0.2, L - 0.12, { r: 0.06, rs: 2, seg: [0.08, 0.05, 0.08], seed: rnd(), noise: 0.004, nf: 6, warp: (lx, ly, lz) => [lx, ly - (ly > 0 ? 0.012 * Math.sin(lx * 3.1 + 1) * Math.sin(lz * 2.3) : 0), lz] });
    block(kit.get('linen'), sub(frame([0, 0, 0]), [bx, 0.66, bz0 + 0.3]), W - 0.15, 0.13, 0.32, { r: 0.06, rs: 2, seg: [0.06, 0.04, 0.06], seed: rnd(), noise: 0.004, nf: 8 });
    foldedCloths(kit, sub(frame([0, 0, 0]), [bx + 0.1, 0.6, bz0 + L - 0.45]), rnd, 2, { w: W - 0.25, d: 0.5 });
  }
  const room = kit.build(M, { name: 'queens-room' });
  scene.add(room);
  // the door leaf on its own hinge (the west jamb)
  const dk = new Kit(0);
  doorBuilder(dk, sub(Fn, [DOOR.x0 + w / 2, 0, 0]), { w: DOOR.w, h: DOOR.h, arch: true, inset: T * 0.6, open: 0, hingeLeft: true, room: false, wallT: T, seed: 53 });
  const leaf = dk.build(M, { name: 'room-door', origin: [0, 0, 0] });
  const hinge = new THREE.Group();
  hinge.position.set(DOOR.x0, 0, -d / 2 - T * 0.6);
  leaf.position.set(-DOOR.x0, 0, d / 2 + T * 0.6);
  hinge.add(leaf); scene.add(hinge);
  // the passage beyond the door: lamplit (someone carried a lamp) - a warm dim card + a light
  const passage = lightCard(1.4, 2.8, [0.5, 0.32, 0.18]); passage.position.set(DOOR.x0 + DOOR.w / 2, 1.4, -d / 2 - T - 0.9); scene.add(passage);
  const passLight = new THREE.PointLight(new THREE.Color(1.0, 0.6, 0.3), 0, 6, 2); passLight.position.set(DOOR.x0 + DOOR.w / 2, 1.8, -d / 2 - T - 0.5); scene.add(passLight);

  // ---- the sill: a wine jug nearly empty and one cup with a dark ring dried inside it
  const vk = await verdorKit(ctx);
  const sillX = w / 2 + 0.22, sillY = WIN.y + 0.005, sillZ = WIN.z0 + 0.45;
  {
    const pk = new PropKit();
    pot(pk, pframe([sillX, sillY, sillZ - 0.1]), prng(31), { kind: 'jug', glaze: 0.7, dark: false });
    pot(pk, pframe([sillX - 0.08, sillY, sillZ + 0.17]), prng(32), { kind: 'cup', glaze: 1 });
    const g = vk.build(pk, 'sill-wine');
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    // the dregs: a dark wine film and a darker meniscus ring inside the cup
    const dregs = new THREE.Mesh(new THREE.CircleGeometry(0.028, 24).rotateX(-Math.PI / 2), new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.06, 0.008, 0.012), roughness: 0.15, clearcoat: 1 }));
    dregs.position.set(sillX - 0.08, sillY + 0.012, sillZ + 0.17); scene.add(dregs);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.031, 0.0345, 32).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.03, 0.004, 0.006), side: THREE.DoubleSide }));
    ring.position.set(sillX - 0.08, sillY + 0.045, sillZ + 0.17); scene.add(ring);
  }
  ctx.camera.near = 0.03; ctx.camera.far = 9000; ctx.camera.updateProjectionMatrix();

  const marks = {
    window: [w / 2, 1.9, WIN.z0 + WIN.w / 2], windowOut: [w / 2 + 20, -2, WIN.z0 + WIN.w / 2],
    sill: [sillX - 0.04, sillY + 0.08, sillZ + 0.03], cup: [sillX - 0.08, sillY + 0.05, sillZ + 0.17], jug: [sillX, sillY + 0.14, sillZ - 0.1],
    door: [DOOR.x0 + DOOR.w / 2, 1.3, -d / 2], doorway: [DOOR.x0 + DOOR.w / 2, 0, -d / 2 - 0.25], doorIn: [DOOR.x0 + DOOR.w / 2, 0, -d / 2 + 0.6],
    alexWin: [w / 2 - 0.62, 0, WIN.z0 + 0.55], bed: [-0.55, 0.6, -1.3],
  };
  return {
    marks, objects: { door: hinge }, ground: () => 0,
    applyShot(info) {
      const st = info.spec.set || {};
      const t = info.local;
      hinge.rotation.y = keyed(t, st.door ?? 0) * 1.5;
      hinge.updateMatrixWorld(true);
      const o = keyed(t, st.door ?? 0);
      passLight.intensity = 2.2 * Math.min(1, o * 3);
      passage.visible = o > 0.01;
    },
    dynamic(info) { const st = info.spec.set || {}; return st.door != null && typeof st.door !== 'number' ? [hinge] : []; },
  };
}
