// Shot director set - PALACE_CORRIDOR (Verdor palace, interior; assets-delta S2): X1 and X2 of 1A.
//
// "Stone corridors with tall windows at intervals and daylight at the far end; a turn where no one
// can see." Built from the architecture library (washed rubble walls with real openings, flagstone
// floor, a joisted ceiling on beams, oil lamps on iron brackets, an arched oak door) - PROVISIONAL.
//
// MAP (VERDOR frame: +x east, -z north): the corridor runs NORTH-SOUTH, 3 m wide (x -1.5..1.5),
// 26 m long (z 0..26). The NORTH end (z = 0) is the birthing chamber's door; the SOUTH end (z = 26)
// opens through a wide arch onto daylight (the way out to the grounds). Tall unglazed lancet windows
// in the EAST wall every 4 m let the sea light in; warm oil lamps on brackets on the WEST wall.
// X1 (first light): no direct sun, cool window light, warm lamp pools. X2 (morning): the sun low in
// the east lays shafts from the windows across the floor onto the west wall.
import * as THREE from 'three';
import { Kit, frame, sub, makeRand } from '../../architecture/core.js';
import { archMaterials } from '../../architecture/materials.js';
import { masonryFace, courses } from '../../architecture/masonry.js';
import { flagFloor, beamCeiling } from '../../architecture/interiors.js';
import { door as doorBuilder } from '../../architecture/openings.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { keyed, clamp } from '../timeline.js';
import { wallFrame, skyDome, lightCard, roomEnvironment, wallLamp, cutBox } from './common.js';

export const CORR = { w: 3.0, L: 26, h: 4.4, T: 0.8 };
const WIN = [3, 7, 11, 15, 19, 23];                      // window centres along z
const DOOR = { w: 1.4, h: 2.7 };                          // the chamber door, north end wall, centred at x = -0.2
const EXIT = { w: 2.3, h: 3.3 };                          // the arch at the south end, centred at x = 0

export function cinematic() {
  return filmFinish({
    volumetrics: {
      enabled: true, range: 40, near: 0.1, resolution: [160, 90, 48], noiseFilter: true,
      density: 0.03, heightFalloff: 0.0, fogBase: 0, anisotropy: 0.45, noiseScale: 0.35, noiseAmount: 0.5, wind: [0.02, 0.0, 0.05], shadowSoftness: 0.08,
      ambient: [0.0004, 0.0004, 0.00045], intensity: 1.0,
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.25, contactShadows: true, contactLength: 0.05, contactMaxDistance: 8 },
    dof: { samples: 48, maxCoC: 0.02 },
    grade: { exposure: 1.2, whiteBalance: 5200, contrast: 1.05, saturation: 0.95 },
    grain: { amount: 3.2 },
    lensFx: { vignette: 0.8 },
  });
}

export async function build(ctx) {
  const { scene, renderer } = ctx;
  const { w, L, h, T } = CORR;
  const rnd = makeRand(531);
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  roomEnvironment(renderer, scene, { size: [w, h, L], wall: [0.06, 0.045, 0.03], intensity: 0.5, patches: [
    ...WIN.map((z) => ({ at: [w / 2, 2.4, z - L / 2], size: [0.8, 2.2], color: [1.1, 1.2, 1.35] })),
    { at: [0, 1.6, L / 2], size: [2.3, 3.3], color: [2.2, 2.2, 2.1] },
  ] });
  // the world outside the openings: a soft sky (first light: grey-blue; morning: brighter)
  const sky = skyDome({ zenith: [0.25, 0.32, 0.45], horizon: [0.75, 0.78, 0.82], ground: [0.12, 0.13, 0.14], glow: [0.6, 0.45, 0.3], glowDir: [1, 0.05, 0.2] });
  scene.add(sky);
  scene.background = null;

  // the sun (X2) / the sky's light through the east windows (X1): one shadowed directional light
  const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.92, 0.8), 2.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(draft ? 2048 : 4096, draft ? 2048 : 4096);
  const sc = sun.shadow.camera; sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 80;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  sun.target.position.set(0, 0, L / 2);
  scene.add(sun, sun.target);

  // ---- the corridor
  const M = await archMaterials(ctx);
  const kit = new Kit(0);
  const C = courses(rnd, h + 0.4, { min: 0.2, max: 0.36, plinth: 0.3 });
  const face = (Fw, len, ops, seed) => masonryFace(kit, Fw, len, h + 0.4, { courses: C, style: 'washed', mat: 'stoneWashed', dressedMat: 'stonePale', mortar: 'mortarWashed', T, lod: 'mid', seed, openings: ops, back: true, backMat: 'mortarPale', quoinStart: () => 0.04, quoinEnd: () => 0.04 });
  // east wall (x = +w/2), running south from z = 0, windows into the corridor
  const Fe = wallFrame([w / 2, 0, 0], [0, 0, 1]);
  face(Fe, L, WIN.map((z) => ({ x: z - 0.4, y: 1.05, w: 0.8, h: 2.25, head: 'arch', reveal: T, archDepth: T, sill: true })), 11);
  // west wall (x = -w/2), running north from z = L
  const Fw = wallFrame([-w / 2, 0, L], [0, 0, -1]);
  face(Fw, L, [], 12);
  // north end wall (z = 0) with the chamber door; south end wall (z = L) with the exit arch
  const Fn = wallFrame([-w / 2, 0, 0], [1, 0, 0]);
  face(Fn, w, [{ x: w / 2 - 0.2 - DOOR.w / 2, y: 0, w: DOOR.w, h: DOOR.h, head: 'arch', reveal: T * 0.6 }], 13);
  const Fs = wallFrame([w / 2, 0, L], [-1, 0, 0]);
  face(Fs, w, [{ x: w / 2 - EXIT.w / 2, y: 0, w: EXIT.w, h: EXIT.h, head: 'arch', reveal: T }], 14);
  flagFloor(kit, frame([0, 0, L / 2]), w, L, rnd, { path: [0, 0.5, 0, L - 0.5] });
  beamCeiling(kit, frame([0, 0, L / 2]), w, L, h, rnd, { beamSpacing: 2.0 });
  // lamps on the west wall, between the windows (warm pools)
  const lamps = [];
  for (const z of [5, 13, 21]) lamps.push(wallLamp(kit, Fw, L - z, 1.85, rnd, { intensity: 1.4 }));
  // the chamber door (its own kit so it can open; hinged at its west jamb)
  const dk = new Kit(0);
  doorBuilder(dk, sub(Fn, [w / 2 - 0.2 - DOOR.w / 2, 0, 0]), { w: DOOR.w, h: DOOR.h, arch: true, inset: T * 0.6, open: 0, hingeLeft: true, room: false, wallT: T, seed: 41 });
  const room = kit.build(M, { name: 'corridor' });
  scene.add(room);
  for (const l of lamps) scene.add(l);
  const leaf = dk.build(M, { name: 'corridor-door', origin: [0, 0, 0] });
  const hinge = new THREE.Group();
  const hx = -0.2 - DOOR.w / 2;                          // the west jamb
  hinge.position.set(hx, 0, -T * 0.6);
  leaf.position.set(-hx, 0, T * 0.6);
  hinge.add(leaf); scene.add(hinge);
  // what is beyond: the chamber (dim, warm) behind the door; daylight beyond the south arch
  const beyondDoor = lightCard(1.6, 3.0, [0.25, 0.14, 0.06]); beyondDoor.position.set(-0.2, 1.5, -T - 0.8); scene.add(beyondDoor);
  const beyondExit = lightCard(3.6, 4.2, [2.6, 2.55, 2.4]); beyondExit.position.set(0, 2.0, L + T + 1.2); scene.add(beyondExit);
  // window light: a cool fill near each window (unshadowed)
  const winLights = WIN.map((z) => { const l = new THREE.PointLight(new THREE.Color(0.75, 0.82, 0.95), 0.0, 6, 2); l.position.set(w / 2 - 0.3, 2.3, z); scene.add(l); return l; });
  const exitLight = new THREE.PointLight(new THREE.Color(1, 0.97, 0.9), 0, 12, 2); exitLight.position.set(0, 2.2, L - 0.6); scene.add(exitLight);
  // bounce: the sunlit floor patches and pale walls light the ceiling and the shadow sides a little
  // (no GI on this renderer - a dim warm-from-below / cool-from-above fill stands in for it)
  const bounce = new THREE.HemisphereLight(new THREE.Color(0.55, 0.6, 0.7), new THREE.Color(0.75, 0.6, 0.45), 0.25);
  scene.add(bounce);

  camera_near(ctx);
  const marks = {
    chamberDoor: [-0.2, 1.4, 0], doorFront: [-0.2, 0, 1.2], exit: [0, 1.6, L], exitIn: [0, 0, L - 1.2],
    mid: [0, 1.5, L / 2], turn: [0, 0, 9],
    ...Object.fromEntries(WIN.map((z, i) => [`win${i + 1}`, [w / 2 - 0.1, 2.2, z]])),
  };
  const api = {
    marks, objects: { door: hinge }, lamps, ground: () => 0,
    applyShot(info) {
      const st = info.spec.set || {};
      const c = info.cont;
      const t = info.local;
      const S = new THREE.Vector3(...(c.sun || [0.7, 0.1, 0.1])).normalize();
      const veiled = !!c.sunVeiled;
      if (veiled) {
        // first light: no direct sun - the sky's light comes in high through the windows, soft
        sun.color.setRGB(0.72, 0.8, 0.95); sun.intensity = 0.9;
        const skyDir = new THREE.Vector3(0.75, 0.62, 0.15).normalize();
        sun.position.copy(sun.target.position).addScaledVector(skyDir, 40);
        winLights.forEach((l) => { l.intensity = 0.9; });
        exitLight.intensity = 2.5;
        beyondExit.material.color.setRGB(1.3, 1.36, 1.45);
        sky.userData.uniforms.uZ.value.setRGB(0.12, 0.15, 0.22); sky.userData.uniforms.uH.value.setRGB(0.45, 0.47, 0.52);
      } else {
        sun.color.setRGB(1.0, 0.9, 0.76); sun.intensity = 1.5 * (st.sun ?? 1);
        sun.position.copy(sun.target.position).addScaledVector(S, 40);
        winLights.forEach((l) => { l.intensity = 0.6; });
        exitLight.intensity = 5;
        beyondExit.material.color.setRGB(3.2, 3.1, 2.9);
        sky.userData.uniforms.uZ.value.setRGB(0.3, 0.42, 0.62); sky.userData.uniforms.uH.value.setRGB(0.95, 0.95, 0.95);
      }
      lamps.forEach((l) => { l.intensity = 1.4 * (st.lamps ?? (veiled ? 1 : 0.6)); });
      bounce.intensity = (veiled ? 0.16 : 0.3) * (st.bounce ?? 1);
      hinge.rotation.y = keyed(t, st.door ?? 0) * 1.6;
      hinge.updateMatrixWorld(true);
      if (ctx.cinematic?.volumetrics) ctx.cinematic.volumetrics.density = veiled ? 0.015 : 0.035;
    },
    dynamic(info) { const st = info.spec.set || {}; return st.door != null && typeof st.door !== 'number' ? [hinge] : []; },
  };
  return api;
}
function camera_near(ctx) { ctx.camera.near = 0.05; ctx.camera.far = 600; ctx.camera.updateProjectionMatrix(); }
void cutBox; void clamp;
