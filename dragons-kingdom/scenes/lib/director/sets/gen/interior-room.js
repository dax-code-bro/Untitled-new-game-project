// Engine set generator - the INTERIOR-ROOM template's builder (browser). A generated set's thin wrapper
// (scenes/lib/director/sets/<id>.js, written by engine/setgen/plan.mjs) holds only PARAMS and calls
// makeInteriorRoom(PARAMS). The room is the alexandria-room / palace-corridor pattern from the architecture
// library: masonry walls (masonry.js) with the door and window openings, an oak door leaf (openings.js), a
// flag floor and a joisted ceiling (interiors.js), wall lamps (sets/common.js) and the furniture vocabulary
// of interior-room-layout.js ITEMS. The layout (and so every sheet mark) comes from roomLayout(PARAMS).
//
// Light: the sun of the shot's continuity (per-episode final/continuity.js) through the window, a cool sky
// fill, the oil lamps (continuity `lamps` 0..1, default 1) and a glowing oven / hearth mouth.
import * as THREE from 'three';
import { Kit, frame, sub, makeRand, block, yawFrame } from '../../../architecture/core.js';
import { archMaterials } from '../../../architecture/materials.js';
import { masonryFace, courses } from '../../../architecture/masonry.js';
import { flagFloor, beamCeiling, bench, stool, bowl } from '../../../architecture/interiors.js';
import { door as doorBuilder } from '../../../architecture/openings.js';
import { barrel, crate, sack } from '../../../architecture/dressing.js';
import { filmFinish } from '../../../../lookdev/finish.js';
import { wallFrame, skyDome, lightCard, roomEnvironment, wallLamp } from '../common.js';
import { roomLayout, wallPoint, IN } from './interior-room-layout.js';

const flat = (marks) => Object.fromEntries(Object.entries(marks).map(([k, m]) => [k, m.at]));

export function makeInteriorRoom(P) {
  const L = roomLayout(P);
  const warm = P.look === 'warm' || /oven|hearth/.test(JSON.stringify(P.items || []));

  function cinematic() {
    return filmFinish({
      volumetrics: {
        enabled: true, range: 20, near: 0.05, resolution: [160, 90, 48], noiseFilter: true,
        density: 0.025, heightFalloff: 0.0, fogBase: 0, anisotropy: 0.55, noiseScale: 0.6, noiseAmount: 0.45, wind: [0.01, 0.0, 0.01], shadowSoftness: 0.08,
        ambient: [0.0004, 0.00035, 0.0003], intensity: 1.0,
      },
      shadows: { cascades: 0 },
      ao: { enabled: true, radius: 0.2, contactShadows: true, contactLength: 0.04, contactMaxDistance: 6 },
      dof: { samples: 48, maxCoC: 0.022 },
      grade: { exposure: 1.2, whiteBalance: warm ? 4600 : 5600, contrast: 1.04, saturation: 0.9 },
      grain: { amount: 3.6 },
      lensFx: { vignette: 0.85 },
    });
  }

  async function build(ctx, o = {}) {
    const { scene, renderer } = ctx;
    const { w, d, h, T } = L;
    const rnd = makeRand(P.seed ?? 401);
    const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
    const win = L.window, door = L.door;
    const patches = [];
    if (win) { const [x, z] = wallPoint(L, win.wall, win.s0 + win.w / 2, 0); patches.push({ at: [x, win.y + win.h / 2, z], size: [win.w, win.h], color: [0.75, 0.78, 0.85] }); }
    roomEnvironment(renderer, scene, { size: [w, h, d], wall: [0.05, 0.04, 0.03], intensity: 0.5, patches });
    // outside: a day sky and the street / yard ground, seen through the window and the door
    scene.add(skyDome({ zenith: [0.2, 0.3, 0.55], horizon: [0.75, 0.78, 0.82], ground: [0.1, 0.1, 0.1], glow: [0.6, 0.5, 0.35], glowDir: [1, 0.3, 0], glowPow: 6 }));
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: new THREE.Color(0.16, 0.14, 0.11), roughness: 0.95 }));
    ground.position.y = -0.02; ground.receiveShadow = true; scene.add(ground);

    // the sun (direction set per shot from continuity) and the sky fill
    const sun = new THREE.DirectionalLight(new THREE.Color(1.0, 0.9, 0.75), 3.2);
    sun.castShadow = true;
    sun.shadow.mapSize.set(draft ? 1024 : 2048, draft ? 1024 : 2048);
    const sc = sun.shadow.camera; sc.left = -w; sc.right = w; sc.top = w; sc.bottom = -w; sc.near = 1; sc.far = 60;
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.02; sun.shadow.radius = 4;
    sun.target.position.set(0, 0.5, 0);
    scene.add(sun, sun.target);
    const setSun = (dir) => { const v = new THREE.Vector3(...(dir || [0.6, 0.5, -0.3])).normalize(); sun.position.copy(sun.target.position).addScaledVector(v, 25); sun.intensity = dir ? 3.2 : 0; };
    setSun(o.continuity ? (o.continuity(o.table?.shots?.[0]?.scene, o.table?.shots?.[0]?.job)?.sun ?? null) : null);
    scene.add(new THREE.HemisphereLight(new THREE.Color(0.55, 0.6, 0.7), new THREE.Color(0.35, 0.3, 0.25), 0.35));
    if (win) {
      const [x, z] = wallPoint(L, win.wall, win.s0 + win.w / 2, 0.5);
      const f = new THREE.PointLight(new THREE.Color(0.75, 0.8, 0.9), 1.4, 7, 2); f.position.set(x, win.y + win.h * 0.6, z); scene.add(f);
    }

    // ---- the room: walls with their openings, floor, ceiling
    const M = await archMaterials(ctx);
    const kit = new Kit(0);
    const C = courses(rnd, h + 0.4, { min: 0.2, max: 0.34, plinth: 0.3 });
    const style = P.stone === 'rubble' ? { style: 'rubble' } : { style: 'washed', mat: 'stoneWashed', dressedMat: 'stonePale', mortar: 'mortarWashed' };
    const face = (Fw, len, ops, seed) => masonryFace(kit, Fw, len, h + 0.4, { courses: C, ...style, T, lod: 'mid', seed, openings: ops, back: true, backMat: 'mortarPale', quoinStart: () => 0.04, quoinEnd: () => 0.04 });
    const frames = {
      east: wallFrame([w / 2, 0, -d / 2], [0, 0, 1]), south: wallFrame([w / 2, 0, d / 2], [-1, 0, 0]),
      west: wallFrame([-w / 2, 0, d / 2], [0, 0, -1]), north: wallFrame([-w / 2, 0, -d / 2], [1, 0, 0]),
    };
    const lens = { east: d, west: d, south: w, north: w };
    let seed = 21;
    for (const wl of ['east', 'south', 'west', 'north']) {
      const ops = [];
      if (door.wall === wl) ops.push({ x: door.s0, y: 0, w: door.w, h: door.h, head: 'arch', reveal: T * 0.6 });
      if (win?.wall === wl) ops.push({ x: win.s0, y: win.y, w: win.w, h: win.h, head: 'arch', reveal: T, archDepth: T, sill: true });
      face(frames[wl], lens[wl], ops, seed++);
    }
    flagFloor(kit, frame([0, 0, 0]), w, d, rnd, {});
    beamCeiling(kit, frame([0, 0, 0]), w, d, h, rnd);

    // ---- furniture (interior-room-layout.js ITEMS)
    const glow = [];
    const oak = (F, x, y, z, sx, sy, sz, mat = 'oakDark') => block(kit.get(mat), sub(F, [x, y, z]), sx, sy, sz, { r: 0.008, rs: 1, seg: [0.3, 0.1, 0.3], seed: rnd(), noise: 0.0015, chip: 0.006 });
    for (const it of L.items) {
      const F = yawFrame(it.at, it.yaw);
      const [sx, sy, sz] = it.size;
      if (it.kind === 'oven' || it.kind === 'hearth') {
        const stone = (x, y, z, a, b, c, r = 0.04) => block(kit.get('stonePale'), sub(F, [x, y, z]), a, b, c, { r, rs: 2, seg: [0.2, 0.2, 0.2], seed: rnd(), noise: 0.01, chip: 0.02 });
        stone(0, 0.4, 0, sx, 0.8, sz);                                                  // the plinth
        if (it.kind === 'oven') stone(0, 1.0, -0.05, sx * 0.92, 0.5, sz * 0.9, 0.22);   // the dome
        else stone(0, sy - 0.1, -sz * 0.1, sx * 1.05, 0.2, sz * 0.8);                  // the mantel
        // the mouth: a dark recess with the fire's glow in it
        const mw = it.kind === 'oven' ? 0.55 : sx * 0.7, mh = it.kind === 'oven' ? 0.36 : 0.6, my = it.kind === 'oven' ? 0.9 : 0.35;
        const mouth = new THREE.Mesh(new THREE.PlaneGeometry(mw, mh), new THREE.MeshStandardMaterial({ color: 0x080503, emissive: new THREE.Color(1.0, 0.38, 0.1), emissiveIntensity: 0.9, roughness: 1 }));
        const mp = new THREE.Vector3(...sub(F, [0, my, sz / 2 + 0.005]).slice(0, 3));
        mouth.position.copy(mp); mouth.rotation.y = it.yaw; scene.add(mouth);
        const fire = new THREE.PointLight(new THREE.Color(1.0, 0.5, 0.18), 2.2, 6, 2);
        fire.position.copy(mp).add(new THREE.Vector3(Math.sin(it.yaw) * 0.35, 0.05, Math.cos(it.yaw) * 0.35)); scene.add(fire);
        glow.push(fire);
      } else if (it.kind === 'counter' || it.kind === 'table') {
        oak(F, 0, sy - 0.03, 0, sx, 0.06, sz, 'oak');                                   // the top
        if (it.kind === 'counter') oak(F, 0, (sy - 0.06) / 2, sz / 2 - 0.06, sx - 0.1, sy - 0.06, 0.04);   // the front boards
        for (const ex of [-1, 1]) for (const ez of [-1, 1]) oak(F, ex * (sx / 2 - 0.1), (sy - 0.06) / 2, ez * (sz / 2 - 0.1), 0.08, sy - 0.06, 0.08);
        if (it.kind === 'counter') {                                                     // loaves and a bowl on it
          for (let k = 0; k < 5; k++) block(kit.get('clayware'), sub(F, [-sx / 3 + k * 0.17, sy + 0.04, -0.05 + (k % 2) * 0.12]), 0.15, 0.08, 0.1, { r: 0.04, rs: 2, seg: [0.05, 0.04, 0.05], seed: rnd(), noise: 0.004 });
          bowl(kit, sub(F, [sx / 3, sy, 0]), rnd, { r: 0.17, h: 0.08 });
        }
      } else if (it.kind === 'bench') bench(kit, F, rnd, { L: sx, d: sz, h: sy });
      else if (it.kind === 'stool') stool(kit, F, rnd, {});
      else if (it.kind === 'shelf') {
        oak(F, 0, it.at[1], 0, sx, 0.04, sz);
        for (let k = 0; k < 3; k++) bowl(kit, sub(F, [-sx / 3 + k * sx / 3, it.at[1] + 0.02, 0]), rnd, { r: 0.1, h: 0.06 });
      } else if (it.kind === 'bed') {
        oak(F, 0, 0.3, 0, sx, 0.25, sz);
        block(kit.get('linen'), sub(F, [0, 0.5, 0]), sx - 0.05, 0.18, sz - 0.1, { r: 0.06, rs: 2, seg: [0.08, 0.05, 0.08], seed: rnd(), noise: 0.004 });
      } else if (it.kind === 'barrel') barrel(kit, F, rnd, {});
      else if (it.kind === 'crate') crate(kit, F, rnd, {});
      else if (it.kind === 'sack') sack(kit, F, rnd, {});
    }
    // ---- the lamps on their brackets
    const lamps = [];
    for (const l of L.lamps) {
      const Fw = frames[l.wall];
      const lt = wallLamp(kit, Fw, l.s, l.y, rnd, { intensity: 1.8, distance: 7 });
      scene.add(lt); lamps.push(lt);
    }
    const room = kit.build(M, { name: 'generated-room' });
    room.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    scene.add(room);
    // ---- the door leaf, a little open (its own hinge at the jamb), a warm-grey street beyond
    {
      const dk = new Kit(0);
      doorBuilder(dk, sub(frames[door.wall], [door.s0, 0, 0]), { w: door.w, h: door.h, arch: true, inset: T * 0.6, open: 0, hingeLeft: true, room: false, wallT: T, seed: 53 });
      const leaf = dk.build(M, { name: 'room-door', origin: [0, 0, 0] });
      const [hx, hz] = wallPoint(L, door.wall, door.s0, -T * 0.6);
      const hinge = new THREE.Group();
      hinge.position.set(hx, 0, hz);
      leaf.position.set(-hx, 0, -hz);
      hinge.add(leaf); scene.add(hinge);
      hinge.rotation.y = -(P.doorOpen ?? 0.45) * Math.sign((IN[door.wall][0] || 1) * (IN[door.wall][1] || 1));
      const [cx, cz] = wallPoint(L, door.wall, door.s0 + door.w / 2, -T - 1.5);
      const street = lightCard(3, 3, [0.35, 0.33, 0.3]); street.position.set(cx, 1.4, cz); street.lookAt(0, 1.4, 0); scene.add(street);
    }
    ctx.camera.near = 0.03; ctx.camera.far = 3000; ctx.camera.updateProjectionMatrix();

    return {
      marks: flat(L.marks), objects: {}, ground: () => 0,
      applyShot(info) {
        const c = info.cont || {};
        setSun(c.sun ?? null);
        const lv = c.lamps ?? 1;
        for (const l of lamps) l.intensity = 1.8 * lv;
        if (c.exposureTrim != null) info.exposureTrim = c.exposureTrim;
      },
    };
  }
  return { LAYOUT: L, cinematic, build };
}
