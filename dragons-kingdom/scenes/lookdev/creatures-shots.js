// Hero look-development shots for the Episode 1 dragons (DESIGN.md: two legs, the wings are the
// front limbs, horns; every dragon its own design). Used by creatures-hero.js (every shot),
// creatures-review.js (1 s per shot, fast checks) and the per-creature wrappers
// creatures-turntable-<name>.js, which build only what their shots need. The all-creature contact
// sheet is creatures-contact.js.
//
// Every shot is framed like a real camera setup: a lens in mm on a Super 35 sensor, a stop, the
// focus on the subject's eye or body, a 180-degree shutter (true sub-frame motion blur with the
// film finish), the photographed sky as the only light (Poly Haven kloofendal_48d_partly_cloudy,
// CC0: its sun extracted into a shadow-casting light, or old_room's window light indoors). Sets:
//   field  open grassland (CC0 photo turf + geometry grass tufts), a dragon on the ground
//   air    the sky and the open sea 150-300 m below (the runtime's FFT ocean), hazed
//   ground a camera on the ground looking up at a flyer, a person in the foreground
//   bed    the straw nest (props library) with the opened egg, window light + cool fill
// Camera and people positions are metres in the subject's frame (x = its left, y = up,
// z = forward); `face` turns the subject relative to the sun's azimuth (0 = facing the sun).
// `place` puts a second dragon in the subject's frame ([x, y, z, yaw deg]); `stage` names a
// staging function (the head-in-mouth hold, the take-off's dust). Every frame is a pure function of t.
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { createCreature, createFire, createDust, poses, loadHuman as loadPlaceholderHuman, createRider as createPlaceholderRider, createSaddle, mountRider } from '../lib/creatures/index.js';
import { grassField } from '../lib/sets/grass.js';
import { filmFinish } from './finish.js';

const D2R = Math.PI / 180;

export const SHOTS = [
  // Charcoal 3/4 front in daylight, standing on his feet and the wrist pads of his folded wings;
  // Remi beside his left wrist for scale (35 mm from ~55 m, eye height)
  { id: 'charcoal-front', set: 'field', creatures: ['charcoal'], tack: ['charcoal'], dur: 3, face: -55,
    people: [{ id: 'remi', at: [6.2, 0, 9.0], yaw: 40 }],
    pose: { charcoal: { name: 'stand', look: [0.22, -0.02], tailCurl: 0.7 } },
    cam: { subject: 'charcoal', pos: [33, 1.7, 44], target: [2.5, 6.8, 6], mm: 35, fstop: 8, focus: 'target' } },
  // Charcoal's head: a crane a little below his eye line, 3/4 front (50 mm), the horns against the sky
  { id: 'charcoal-head', set: 'field', creatures: ['charcoal'], dur: 3, face: -60,
    pose: { charcoal: { name: 'stand', look: [0.35, 0.05], blink: false, lidRelax: 0.05 } },
    cam: { subject: 'charcoal', bone: 'head', pos: [9.5, -1.0, 9.0], target: [0.2, -0.6, 1.4], mm: 50, fstop: 5.6, focus: 'eye_L' } },
  // the take-off (1C): the first heavy downstroke after the vault - the downwash blasts a ring of
  // dust and grass, clods fly, the wrist-pad craters and claw furrows in the turf (24 mm, low, ~90 m)
  { id: 'charcoal-takeoff', set: 'field', creatures: ['charcoal'], tack: ['charcoal'], riders: { charcoal: 'remi' }, dur: 4, face: -40, stage: 'takeoff', still: 1.0,
    pose: { charcoal: { name: 'launch', t0: 2.9, look: [0.0, 0.15] } },
    cam: { subject: 'charcoal', pos: [62, 2.2, 70], target: [0, 9, 4], mm: 24, fstop: 8, focus: 'target', fixed: true } },
  // Charcoal and Leaf side by side (1C/1D): Leaf beside Charcoal's head, ahead of his wing, the
  // riders close enough to talk; side-on from ~140 m (50 mm). Charcoal 0.42 Hz, Leaf ~1 Hz
  { id: 'pair-flight', set: 'air', creatures: ['charcoal', 'leaf'], riders: { charcoal: 'remi', leaf: 'abby' }, dur: 3, alt: 240, face: -90,
    place: { leaf: [14, 3.0, 20, 0] },
    pose: { charcoal: { name: 'flight', phase: 0.45, look: [0.25, 0.02] }, leaf: { name: 'flight', hz: 1.0, phase: 0.4, corr: 0.4, look: [-0.3, 0.05] } },
    cam: { subject: 'charcoal', pos: [75, 40, 85], target: [4, 4, 10], mm: 38, fstop: 8, focus: 'target', shutter: 90 } },
  // the head-in-mouth (1D): Charcoal's neck curled round, Leaf's whole head held in his jaws at a
  // 25-degree holding gape, snout first; Abby on Leaf's saddle stays clear (32 mm, ~34 m)
  { id: 'head-in-mouth', set: 'air', creatures: ['charcoal', 'leaf'], riders: { charcoal: 'remi', leaf: 'abby' }, dur: 3, alt: 220, face: -110, stage: 'mouth',
    pose: { charcoal: { name: 'mouthHold', t0: 2.0, side: 1, turn: 1.65, pitch: 0.05 }, leaf: { name: 'glide', look: [-1.45, 0.05], lidRelax: 0.05, blink: false, corr: 0.6 } },
    cam: { subject: 'charcoal', pos: [24, 22, 34], target: [6, 8.5, 13], mm: 32, fstop: 8, focus: 'target' } },
  // Leaf sitting upright like a dog (1B), Abby beside his chest (35 mm, eye height, f/5.6)
  { id: 'leaf-abby', set: 'field', creatures: ['leaf'], tack: ['leaf'], dur: 3, face: -70,
    people: [{ id: 'abby', at: [1.9, 0, 1.5], yaw: 75 }],
    pose: { leaf: { name: 'sit', look: [0.4, -0.08], eyes: [0.12, -0.05] } },
    cam: { subject: 'leaf', pos: [9.5, 1.6, 10.5], target: [0.4, 2.1, 0.5], mm: 32, fstop: 5.6, focus: 'target' } },
  // FIRE (DRAGONS.md): Charcoal's standard orange-red fire - head low, a 26 m jet (32 mm, 3/4 side)
  { id: 'charcoal-fire', set: 'field', creatures: ['charcoal'], dur: 3, face: -80, fire: { charcoal: { palette: 'standard', length: 26, width: 7 } },
    pose: { charcoal: { name: 'fire', t0: 1.6, aim: [0.05, -0.05] } },
    cam: { subject: 'charcoal', pos: [46, 3.0, 30], target: [0, 5.0, 22], mm: 32, fstop: 8, focus: 'target' } },
  // Leaf's purplish-blue fire (a little hotter than normal; not on screen in Episode 1)
  { id: 'leaf-fire', set: 'field', creatures: ['leaf'], dur: 3, face: -80, fire: { leaf: { palette: 'leaf', length: 8, width: 2.2 } },
    pose: { leaf: { name: 'fire', t0: 1.6, aim: [0.05, -0.05] } },
    cam: { subject: 'leaf', pos: [11.5, 1.2, 8.0], target: [0, 1.4, 5.5], mm: 32, fstop: 8, focus: 'target' } },
  // Starlight gliding high over open country, seen from the ground (~400 m away, ~95 m up): a 27 m
  // watchtower at her distance for scale, a watchman pointing; haze between (40 mm)
  { id: 'starlight-below', set: 'ground', creatures: ['starlight'], tack: ['starlight'], dur: 3, face: 160, haze: 3.0, fill: true,
    flyer: { name: 'starlight', at: [-30, 95, 400], heading: -125 },
    tower: { at: [16, 0, 380], r: 3.6, h: 21, capH: 6.5 }, trees: true,
    people: [{ id: 'watchman', ground: [-0.95, 0, 4.6], yaw: -12 }],
    pose: { starlight: { name: 'glide', bank: -0.1, dihedral: 0.1, look: [0.1, -0.2] } },
    cam: { ground: true, pos: [0, 1.0, 0], lookAt: [-12, 92, 390], mm: 40, fstop: 4 } },
  // Starlight's dive-bomb (3C): the half-folded "M" stoop, steep, toward the ground (35 mm from below)
  { id: 'starlight-dive', set: 'ground', creatures: ['starlight'], dur: 3, face: 160, haze: 2.4, fill: true,
    flyer: { name: 'starlight', at: [20, 115, 215], heading: -125, pitch: 50, roll: 0.1 },
    tower: { at: [-40, 0, 300], r: 3.6, h: 21, capH: 6.5 }, trees: true,
    pose: { starlight: { name: 'dive', fold: 0.85, look: [0, 0.35] } },
    cam: { ground: true, pos: [0, 1.2, 0], lookAt: [12, 100, 205], mm: 28, fstop: 4 } },
  // the gold hatchling on the bedding (1A): 85 mm macro, focus on the eye; weak, pushing up on its
  // wrists, head too heavy
  { id: 'hatchling-macro', set: 'bed', creatures: ['hatchling'], dur: 3, face: -40,
    pose: { hatchling: { name: 'struggle', t0: 2.9, look: [0.2, -0.06] } },
    cam: { subject: 'hatchling', bone: 'head', pos: [1.3, 0.34, 0.42], target: [0.0, -0.07, 0.06], mm: 85, fstop: 8, focus: 'eye_L' } },
  // the scout banking hard at speed, its hooded rider low along the neck (tracking, 45 mm)
  { id: 'scout-bank', set: 'air', creatures: ['scout'], riders: { scout: 'scout' }, dur: 3, alt: 200, face: -130,
    pose: { scout: { name: 'glide', bank: 0.85, look: [0.3, 0.0], dihedral: 0.05 } },
    cam: { subject: 'scout', pos: [9.0, 1.2, 7.5], target: [0, 0.2, 0.6], mm: 45, fstop: 8, focus: 'target' } },
  // the scout loses its LEFT wing (0.5 s after the tear): the wing tumbles away in the wake, the
  // body rolls to the lost side and drops (tracks the midpoint, without the roll; silhouette)
  { id: 'scout-wingloss', set: 'air', creatures: ['scout'], riders: { scout: 'scout' }, dur: 4, alt: 200, face: -130, detachAt: 0.6, still: 1.1,
    pose: { scout: { name: 'sprint' } },
    cam: { subject: 'scout', track: 'wingloss', pos: [19, 5, -3.0], target: [0, -0.4, 0], mm: 35, fstop: 8, focus: 'target' } },
];

/** Build a scene module for the given shot ids (default: all). */
export function makeTurntable(opts = {}) {
  const shots = SHOTS.filter((s) => !opts.only || opts.only.includes(s.id)).map((s) => ({ ...s, ...(opts.step ? { dur: opts.step } : {}) }));
  let start = 0;
  for (const s of shots) { s._start = start; start += s.dur; }
  const total = start;
  const need = [...new Set(shots.flatMap((s) => s.creatures))];
  const needSets = new Set(shots.map((s) => s.set));
  const S = { C: {}, riders: {}, tacks: {}, people: [], sun: null, sunDir: null, sky: null, ground: null, grass: null, bed: null, dust: null };

  const meta = {
    title: opts.title || 'Dragon hero shots (DESIGN.md wyverns)', duration: total, seed: 7,
    cinematic: opts.cinematic ?? filmFinish({
      atmosphere: { enabled: true, sky: 'scene', haze: 1.4, apDistanceScale: 1.0 },
      grade: { exposure: 0.2 },
      shadows: { cascades: 0 },
    }),
  };

  async function setup(ctx) {
    const { scene, quality } = ctx;
    const q = opts.quality || (ctx.preset === 'final' || ctx.preset === 'final-fast' ? 'hero' : ctx.preset === 'preview' ? 'standard' : 'draft');
    const outdoor = [...needSets].some((s) => s !== 'bed');
    if (outdoor) {
      const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: opts.hdriRotation ?? -1.2, horizonFill: { above: 4, below: -2, blend: 2 } });
      S.sky = sky;
      const sun = sky.apply(scene);
      sun.castShadow = true;
      sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      sun.shadow.bias = -0.0002;
      scene.add(sun, sun.target);
      S.sun = sun; S.sunDir = sky.sun.direction.clone();
      const groundMat = await loadPBR('pbr/acg_ground13', ctx, { worldSize: 16000 });
      breakTiling(groundMat);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(9000, 256), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      S.ground = ground;
    }
    if (needSets.has('air')) {
      const { createOcean } = await import('dk/ocean.js');
      S.ocean = createOcean(ctx, { windSpeed: 8, windDirection: 30, swell: 0.45, choppiness: 1.1, seed: 4, roughness: 0.05 });
      scene.add(S.ocean.mesh);
    }
    if (needSets.has('bed')) {
      S.room = await loadHDRI('hdri/old_room', ctx, { rotationY: 0.6 });
      if (!outdoor) S.room.apply(ctx.scene);
      S.bed = await buildBed(ctx);
    }
    if (shots.some((x) => x.fill)) {
      S.fill = new THREE.DirectionalLight(new THREE.Color(0.72, 0.8, 0.95), 0.9);
      S.fill.position.set(0, -1, 0.2);
      S.fill.target.position.set(0, 0, 0);
      S.fill.castShadow = false;
      S.fill.visible = false;
      scene.add(S.fill, S.fill.target);
    }
    const towerShots = shots.filter((x) => x.tower);
    if (towerShots.length) {
      const { buildingKit } = await import('../lib/sets/buildings.js');
      const kit = await buildingKit(ctx, {});
      for (const sh of towerShots) {
        const tw = kit.tower({ r: sh.tower.r, h: sh.tower.h, capH: sh.tower.capH, slits: 4 });
        tw.position.set(...sh.tower.at);
        tw.visible = false;
        scene.add(tw);
        sh._tower = tw;
      }
    }
    if (shots.some((x) => x.trees)) {
      const { bushGeometry, foliageMaterial, scatter } = await import('../lib/sets/scatter.js');
      S.trees = treeBand(bushGeometry, foliageMaterial, scatter);
      S.trees.visible = false;
      scene.add(S.trees);
    }
    for (const name of need) {
      const c = await createCreature(name, { quality: q, log: (m) => console.log(m) });
      scene.add(c.root);
      c.root.visible = false;
      S.C[name] = c;
    }
    for (const sh of shots.filter((x) => x.fire)) {
      sh._fires = Object.entries(sh.fire).map(([n, f]) => {
        const fire = createFire({ palette: f.palette, length: f.length, width: f.width, seed: 3 });
        fire.group.visible = false;
        scene.add(fire.group);
        return { n, fire };
      });
    }
    if (shots.some((x) => x.stage === 'takeoff')) {
      S.dust = createDust({ radius: 34, seed: 2, color: [0.4, 0.36, 0.28] });
      S.dust.group.visible = false;
      scene.add(S.dust.group);
    }
    if (needSets.has('field')) {
      S.grass = {};
      for (const s of shots.filter((x) => x.set === 'field')) {
        const g = fieldGrass(S, s);
        g.visible = false;
        scene.add(g);
        S.grass[s.id] = g;
      }
    }
    const ppl = shots.flatMap((s) => (s.people || []).map((p) => p.id));
    const riderOutfits = shots.flatMap((s) => Object.values(s.riders || {}));
    const H = (ppl.length || riderOutfits.length) ? await loadPeople(ppl, riderOutfits) : null;
    for (const s of shots) {
      for (const n of s.tack || []) if (!S.tacks[n]) S.tacks[n] = createSaddle(S.C[n], {});
      for (const [n, outfit] of Object.entries(s.riders || {})) {
        if (S.riders[n]) continue;
        const tack = S.tacks[n] || (S.tacks[n] = createSaddle(S.C[n], {}));
        const rider = H.rider(outfit, outfit === 'scout' ? { lean: 0.55 } : { lean: n === 'charcoal' ? 0.2 : 0.15 });
        mountRider(S.C[n], tack, rider);
        S.riders[n] = { tack, rider };
      }
      s._people = (s.people || []).map((p) => {
        const h = H.person(p.id);
        h.root.visible = false;
        scene.add(h.root);
        S.people.push(h);
        return { ...p, h };
      });
    }
    console.log('[creatures] built', Object.entries(S.C).map(([n, c]) => `${n}: ${c.stats.vertices} v, ${c.stats.buildMs} ms`).join('; '));
  }

  const camFocus = new THREE.Vector3();
  const toWorld = (c, p) => new THREE.Vector3(p[0], p[1], p[2]).applyQuaternion(c.root.quaternion).add(c.root.position);

  function update(t, ctx) {
    const { camera, scene } = ctx;
    const tf = opts.step ? Math.round(t) : Math.round(t * 24) / 24;
    let shot = tf < 0 ? shots[0] : shots[shots.length - 1];
    for (const s of shots) if (tf >= s._start - 1e-6 && tf < s._start + s.dur - 1e-6) { shot = s; break; }
    const lt = opts.step ? (shot.still ?? 0) + (tf - shot._start) + (t - tf) / 24 : t - shot._start;
    for (const [n, c] of Object.entries(S.C)) c.root.visible = shot.creatures.includes(n);
    for (const h of S.people) h.root.visible = false;
    for (const p of shot._people || []) p.h.root.visible = true;
    for (const [n, tk] of Object.entries(S.tacks)) for (const m of tk.meshes) m.visible = (shot.tack || []).includes(n) || !!(shot.riders && shot.riders[n]);
    for (const [n, r] of Object.entries(S.riders)) r.rider.root.visible = !!(shot.riders && shot.riders[n]);
    if (S.bed) S.bed.visible = shot.set === 'bed';
    for (const s of shots) if (s._tower) s._tower.visible = s === shot;
    if (S.trees) S.trees.visible = !!shot.trees;
    if (S.ground) S.ground.visible = shot.set !== 'bed' && !(S.ocean && shot.set === 'air');
    if (S.ocean) { S.ocean.mesh.visible = shot.set === 'air'; if (shot.set === 'air') S.ocean.update(lt); }
    if (S.grass) for (const [n, g] of Object.entries(S.grass)) g.visible = shot.set === 'field' && shot.id === n;
    if (S.bed && S.bed.userData.lights) for (const l of S.bed.userData.lights) l.visible = shot.set === 'bed';
    if (S.sun) S.sun.visible = shot.set !== 'bed';
    if (S.fill) S.fill.visible = !!shot.fill;
    if (S.dust) S.dust.group.visible = shot.stage === 'takeoff';
    {
      const env = shot.set === 'bed' ? S.room : S.sky;
      const rot = shot.set === 'bed' ? 0.6 : (opts.hdriRotation ?? -1.2);
      if (env) {
        scene.environment = env.envMap; scene.background = env.texture;
        scene.environmentRotation.set(0, rot, 0); scene.backgroundRotation.set(0, rot, 0);
        scene.backgroundBlurriness = shot.set === 'bed' ? 0.5 : 0;
      }
    }
    if (ctx.cinematic?.atmosphere) ctx.cinematic.atmosphere.haze = shot.haze ?? (shot.set === 'bed' ? 0 : 1.4);

    // ---------------------------------------------------------- poses
    const sunAz = S.sunDir ? Math.atan2(S.sunDir.x, S.sunDir.z) : 0;
    const faceYaw = sunAz + (shot.face ?? 0) * D2R;
    const main = S.C[shot.creatures[0]];
    for (const n of shot.creatures) {
      const c = S.C[n];
      const po = shot.pose[n] || { name: 'stand' };
      c.root.position.set(0, 0, 0);
      c.root.rotation.set(0, faceYaw, 0);
      if (c.detachable) c.attachWing();
      c.setPose(poses[po.name](c, { ...po, t: lt + (po.t0 ?? 0) }));
      if (shot.set === 'bed') c.root.position.y = S.bed.userData.top;
      if (shot.alt) c.root.position.y = shot.alt;
      if (shot.flyer && shot.flyer.name === n) {
        c.root.position.set(...shot.flyer.at);
        c.root.rotation.set(0, 0, 0);
        c.root.rotation.order = 'YXZ';
        c.root.rotation.set((shot.flyer.pitch ?? 0) * D2R, (shot.flyer.heading ?? 0) * D2R, shot.flyer.roll ?? 0);   // pitch: nose down (deg)
      }
      if (shot.place && shot.place[n] && c !== main) {
        const pl = shot.place[n];
        const w = toWorld(main, pl);
        c.root.position.copy(w);
        c.root.rotation.set(0, faceYaw + (pl[3] ?? 0) * D2R, 0);
      }
      c.root.updateMatrixWorld(true);
    }
    if (shot.stage === 'mouth') stageMouth(S, shot);
    if (shot.stage === 'takeoff') stageTakeoff(S, shot, lt);
    if (shot.set === 'bed' && S.C.hatchling) updateStrands(S.bed, S.C.hatchling);
    for (const s of shots) for (const f of s._fires || []) {
      const po = s.pose[f.n] || {};
      if (s === shot) f.fire.update(lt, { creature: S.C[f.n], on: smoothstepJS(0.95, 1.1, lt + (po.t0 ?? 0)) });
      else { f.fire.group.visible = false; f.fire.light.intensity = 0; }
    }
    if (shot.detachAt !== undefined) scoutWingLoss(S.C.scout, shot, lt, faceYaw, scene);
    for (const r of Object.values(S.riders)) r.rider.update?.(lt);
    for (const p of shot._people || []) {
      const h = p.h;
      if (p.ground) h.place(p.ground[0], 0, p.ground[2], (p.yaw ?? 0) * D2R);
      else {
        const w = toWorld(main, p.at);
        h.place(w.x, 0, w.z, main.root.rotation.y + (p.yaw ?? 180) * D2R);
      }
      h.update(lt);
    }

    // ---------------------------------------------------------- camera
    const cm = shot.cam;
    let target;
    if (cm.ground) {
      camera.position.set(...cm.pos);
      target = new THREE.Vector3(...cm.lookAt);
      camera.lookAt(target);
      if (cm.tilt) camera.rotateZ(cm.tilt);
      camFocus.copy(main.root.position);
    } else {
      const c = S.C[cm.subject];
      c.root.updateMatrixWorld(true);
      let base = c.root.position.clone(), q = c.root.quaternion;
      // (fixed: the camera stays where it was at the start of the move, a locked-off take)
      if (cm.fixed) base = new THREE.Vector3(0, c.root.position.y, 0);
      if (cm.bone) base = new THREE.Vector3().setFromMatrixPosition(c.bones[c.boneIndex[cm.bone]].matrixWorld);
      if (cm.track === 'wingloss' && c.detachable) {
        const wp = new THREE.Vector3().setFromMatrixPosition(c.detachable.rootBone.matrixWorld);
        base = c.root.position.clone().lerp(wp, 0.5);
        q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), faceYaw);
      }
      target = base.clone().add(new THREE.Vector3(...cm.target).applyQuaternion(q));
      camera.position.copy(base).add(new THREE.Vector3(...cm.pos).applyQuaternion(q));
      camera.lookAt(target);
      camFocus.copy(target);
      if (cm.focus && cm.focus !== 'target') camFocus.setFromMatrixPosition(c.bones[c.boneIndex[cm.focus]].matrixWorld);
    }
    const dist = camera.position.distanceTo(target);
    camera.near = Math.max(0.01, Math.min(dist * 0.02, 1.0));
    camera.far = 20000;
    camera.updateProjectionMatrix();
    if (S.sun) {
      const R = shot.set === 'field' ? main.L * 1.0 : shot.creatures.length > 1 ? main.L * 1.1 : main.L * 0.85;
      const ctr = cm.ground ? main.root.position.clone() : (cm.bone ? main.root.position.clone().add(new THREE.Vector3(0, main.L * 0.15, 0)) : target.clone());
      fitShadow(S, shot.stage === 'takeoff' ? main.root.position.clone().setY(main.L * 0.25) : ctr, shot.stage === 'takeoff' ? main.L * 1.5 : R);
    }
    if (ctx.lens) {
      ctx.lens.focalLength = cm.mm;
      ctx.lens.fstop = cm.fstop ?? 8;
      ctx.lens.focus = camera.position.distanceTo(camFocus);
      ctx.lens.shutterAngle = cm.shutter ?? 180;
    } else {
      camera.filmGauge = 24.89;
      camera.setFocalLength(cm.mm);
    }
    if (ctx.cinematic?.ao) ctx.cinematic.ao.radius = Math.max(0.01, main.L * 0.03);
  }
  return { meta, setup, update, shots };
}

const smoothstepJS = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * The head-in-mouth hold (1D): Leaf is placed so that his head lies snout first in Charcoal's
 * mouth (the snout tip ~1.1 m inside the front teeth, Leaf's head axis turned against
 * Charcoal's). Pure: both poses are already set; only Leaf's root moves.
 */
function stageMouth(S, shot) {
  const ch = S.C.charcoal, lf = S.C.leaf;
  if (!ch || !lf) return;
  const headAxis = (c) => {
    const hb = c.bones[c.boneIndex.head];
    const q = hb.getWorldQuaternion(new THREE.Quaternion());
    const ez = c.anatomy.head.frame.ez;
    return new THREE.Vector3(ez[0], ez[1], ez[2]).applyQuaternion(q).normalize();
  };
  const sockW = (c, s) => new THREE.Vector3(...s.pos).applyMatrix4(c.skeleton.boneInverses[c.boneIndex[s.bone]]).applyMatrix4(c.bones[c.boneIndex[s.bone]].matrixWorld);
  ch.root.updateMatrixWorld(true); lf.root.updateMatrixWorld(true);
  const dC = headAxis(ch);
  const front = sockW(ch, ch.anatomy.sockets.mouthFront);
  const target = front.clone().addScaledVector(dC, -1.1);                 // where Leaf's snout tip goes
  // turn Leaf about the vertical so his head axis points against Charcoal's
  const dL = headAxis(lf);
  const a0 = Math.atan2(dL.x, dL.z), a1 = Math.atan2(-dC.x, -dC.z);
  lf.root.rotation.y += a1 - a0;
  lf.root.updateMatrixWorld(true);
  const tip = sockW(lf, lf.anatomy.sockets.mouthFront);
  lf.root.position.add(target.clone().sub(tip));
  lf.root.updateMatrixWorld(true);
}

/** The take-off's ground effects (dust rings under every downstroke, clods from the kick, scars). */
function stageTakeoff(S, shot, lt) {
  const c = S.C.charcoal;
  if (!c || !S.dust) return;
  const po = shot.pose.charcoal;
  const tl = lt + (po.t0 ?? 0);
  const sc = Math.sqrt(c.L / 36), T1 = 1.5 * sc, T2 = T1 + 0.6 * sc, T3 = T2 + 1.2 * sc;
  const hz = (c.config.flapHz ?? 0.42) * 1.12;
  // the half-opened wings' first push at the top of the vault, then every downstroke
  const bursts = [T2 + 0.7 * sc, T3 + 0.45, T3 + 0.45 + 1 / hz, T3 + 0.45 + 2 / hz, T3 + 0.45 + 3 / hz];
  const yaw = c.root.rotation.y;
  const fwd = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
  // the contacts of the crouch (computed once: a pure function of the shot)
  if (!shot._scars) {
    const keep = c.root.position.clone();
    c.setPose(poses.crouch(c, { t: 0, k: 1 }));
    c.root.updateMatrixWorld(true);
    const ct = poses.contactsOf(c);
    const pads = ct.filter((x) => x.wrist).map((x) => [x.world.x, x.world.z]);
    const toes = ct.filter((x) => /_t[123]$/.test(x.bone)).map((x) => [x.world.x, x.world.z]);
    shot._scars = { pads, toes };
    S.dust.setScars([...pads.map((p) => ({ at: p, r: 1.1, kind: 'crater' })), ...toes.map((p) => ({ at: [p[0] - fwd.x * 0.4, p[1] - fwd.z * 0.4], dir: [-fwd.x, -fwd.z], len: 3.0, w: 0.35, kind: 'furrow' }))]);
    c.root.position.copy(keep);
    c.setPose(poses[po.name](c, { ...po, t: tl }));
    c.root.updateMatrixWorld(true);
  }
  const center = c.root.position.clone().setY(0).addScaledVector(fwd, 6);
  S.dust.update(tl, { center, bursts, kick: T1 + 0.25, kickPoints: [...shot._scars.pads, ...shot._scars.toes], strength: 1.0 });
}

/** The scout's LEFT wing tears away at shot.detachAt and tumbles in the wake (pure in lt). */
function scoutWingLoss(c, shot, lt, faceYaw, scene) {
  const td = shot.detachAt;
  if (lt < td) return;
  c.setPose(poses.sprint(c, { t: td }));
  c.root.updateMatrixWorld(true);
  const M0 = c.detachable.rootBone.matrixWorld.clone();
  const dt = lt - td;
  const fwd = new THREE.Vector3(Math.sin(faceYaw), 0, Math.cos(faceYaw));
  // the body: only the right wing still lifts, so it rolls toward the lost LEFT side, pitches
  // nose-down and drops; the right wing flails
  c.setPose(poses.flight(c, { t: lt, hz: 1.8, bank: -(0.6 * dt + 0.2), amp: 0.75, bodyPitch: 0.3 * dt, corr: 1 }));
  c.root.position.y = (shot.alt ?? 0) - 0.5 * 9.81 * dt * dt * 0.6;
  c.root.position.addScaledVector(fwd, 9 * dt);
  c.root.rotateZ(-1.3 * dt);
  const side = new THREE.Vector3(Math.cos(faceYaw), 0, -Math.sin(faceYaw));
  const g = side.multiplyScalar(3.6 * dt).addScaledVector(fwd, -3.5 * dt).add(new THREE.Vector3(0, 1.5 * dt - 0.5 * 9.81 * dt * dt * 0.12, 0));
  const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(2.0 * dt, 0.7 * dt, 2.6 * dt));
  const p = new THREE.Vector3().setFromMatrixPosition(M0);
  const M = new THREE.Matrix4().compose(p.add(g), new THREE.Quaternion().setFromRotationMatrix(M0).premultiply(spin), new THREE.Vector3(1, 1, 1));
  c.detachWing(scene, M);
  // the torn wing goes limp: half folded, a finger snapped
  for (const n of ['w_L_1', 'w_L_2']) { const b = c.bones[c.boneIndex[n]]; if (b) b.quaternion.setFromEuler(new THREE.Euler(0, n === 'w_L_1' ? -0.9 : 0.8, 0.3)); }
  { const b = c.bones[c.boneIndex.w_L_f1_1]; if (b) b.quaternion.setFromEuler(new THREE.Euler(0.9, -0.7, 0.4)); }
  c.materials.setPoseUniforms({ billowL: 0.5 * Math.sin(lt * 31.0) });
}

/**
 * People for the shots: the humans library (scenes/lib/humans, cast builds from the offline
 * MakeHuman pipeline) when its cache has the character, else the placeholder rider of
 * creatures/rider.js. Returns { person(id) -> {root, place, update}, rider(outfit) }.
 */
async function loadPeople(ids, riderOutfits) {
  let lib = null;
  try { lib = await import('../lib/humans/index.js'); } catch (e) { lib = null; }
  const chars = {};
  if (lib) for (const id of new Set(ids)) { try { chars[id] = await lib.loadCharacterData(id); } catch (e) { chars[id] = null; } }
  let riderTok = null;
  if (lib && riderOutfits.length) { try { riderTok = await lib.loadHuman({ ids: riderOutfits.map((o) => `${o}_ride`) }); } catch (e) { riderTok = null; } }
  const needPlaceholder = ids.some((id) => !chars[id]) || (riderOutfits.length && (!riderTok || riderOutfits.some((o) => !riderTok.data[`${o}_ride`] || riderTok.data[`${o}_ride`] instanceof Error)));
  const ph = needPlaceholder ? await loadPlaceholderHuman() : null;
  const outfitOf = (id) => (id.startsWith('abby') ? 'abby' : id.startsWith('remi') ? 'remi' : id.startsWith('fall') ? 'fall' : 'remi');
  return {
    person(id) {
      if (chars[id]) {
        const ch = lib.buildCharacter(chars[id], {});
        return { root: ch.root, character: ch, place: (x, y, z, yaw) => lib.placeCharacter(ch, x, y, z, yaw), update: (t) => lib.applyIdle(ch, t) };
      }
      const r = createPlaceholderRider(ph, { outfit: outfitOf(id), pose: 'stand', headPitch: -0.1 });
      return { root: r.root, place: (x, y, z, yaw) => { r.root.position.set(x, y + 0.88, z); r.root.rotation.set(0, yaw, 0); }, update: () => {} };
    },
    rider(outfit, o = {}) {
      const lean = o.lean ?? 0.12;
      if (riderTok && riderTok.data[`${outfit}_ride`] && !(riderTok.data[`${outfit}_ride`] instanceof Error)) return lib.createRider(riderTok, { outfit, lean });
      return createPlaceholderRider(ph, { outfit, lean });
    },
  };
}

/**
 * Grass tufts in the camera's view of a field subject (deterministic): laid out in the
 * subject's frame in a sector from the camera toward the subject, uniform in log distance
 * (about the same number of tufts per screen area near and far, dense at the lens).
 */
function fieldGrass(S, shot) {
  const c = S.C[shot.creatures[0]];
  const L = c.L;
  const cam = shot.cam;
  const g = new THREE.Group();
  const cx = cam.pos[0], cz = cam.pos[2];
  const tx = cam.target ? cam.target[0] : 0, tz = cam.target ? cam.target[2] : 0;
  const d = Math.hypot(cx - tx, cz - tz);
  const dirA = Math.atan2(tx - cx, tz - cz);               // camera -> its target (the view's centre)
  const rMin = 1.2, rMax = d + L * 0.7 + (shot.fire ? 120 : 0);   // (fire shots look far down the field)
  const half = (Math.atan(24.89 / 2 / cam.mm) + (shot.fire ? 0.6 : 0.25));
  const place = (rng) => {
    const r = rMin * Math.pow(rMax / rMin, rng());
    const a = dirA + (rng() * 2 - 1) * half;
    return [cx + Math.sin(a) * r, 0, cz + Math.cos(a) * r];
  };
  g.add(grassField({ count: 70000, height: [0.07, 0.24], seed: 5, color: [0.05, 0.072, 0.022], dry: [0.2, 0.17, 0.085], dryAmount: 0.5, place }));
  g.add(grassField({ count: 14000, height: [0.2, 0.45], seed: 7, blades: 12, width: 1.1, color: [0.035, 0.055, 0.018], dry: [0.22, 0.19, 0.1], dryAmount: 0.65, place }));
  g.add(grassField({ count: 3000, height: [0.4, 0.7], seed: 11, blades: 3, width: 0.5, color: [0.16, 0.135, 0.065], dry: [0.26, 0.22, 0.12], dryAmount: 0.8, place }));
  const sunAz = S.sunDir ? Math.atan2(S.sunDir.x, S.sunDir.z) : 0;
  g.rotation.y = sunAz + (shot.face ?? 0) * D2R;
  return g;
}

/**
 * Hedgerows and copses in front of a ground camera at the origin looking along +z (built once,
 * deterministic): tree-sized clumps of the set kit's bush geometry along field boundaries
 * (lines across the view at irregular spacing) and in a few woods, 400 m to 2.5 km away.
 */
function treeBand(bushGeometry, foliageMaterial, scatter) {
  const g = new THREE.Group();
  const geos = [bushGeometry(3, 2, 0.9), bushGeometry(3, 5, 1.0), bushGeometry(3, 9, 0.85)];
  const mat = foliageMaterial({ color: [0.045, 0.06, 0.028], leafScale: 0.35 });
  const rows = [420, 520, 640, 780, 950, 1150, 1400, 1800, 2300];
  const woods = [[-260, 600, 90], [260, 760, 120], [-520, 1000, 170], [80, 1350, 220], [620, 1700, 280]];
  geos.forEach((geo, gi) => {
    const mesh = scatter(geo, mat, 520, (rng) => {
      let x, z;
      if (rng() < 0.6) {
        const zr = rows[Math.floor(rng() * rows.length)];
        z = zr + (rng() - 0.5) * 14;
        x = (rng() * 2 - 1) * z * 0.75;
        if (Math.sin(x * 0.013 + zr) > 0.55) return null;            // gaps in the hedges
      } else {
        const w = woods[Math.floor(rng() * woods.length)];
        const a = rng() * Math.PI * 2, r = Math.sqrt(rng()) * w[2];
        x = w[0] + Math.cos(a) * r; z = w[1] + Math.sin(a) * r * 0.6;
      }
      if (z < 380) return null;
      const h = 5 + rng() * rng() * 14, wdt = h * (0.7 + rng() * 0.7);
      const k = 0.75 + rng() * 0.5;
      return { p: [x, -0.4, z], s: [wdt, h, wdt * (0.8 + rng() * 0.4)], r: rng() * 6.28, c: [k * (0.9 + 0.2 * rng()), k, k * (0.85 + 0.2 * rng())] };
    }, 11 + gi * 7);
    mesh.castShadow = false;
    g.add(mesh);
  });
  return g;
}

/** Fit the sun's shadow frustum around a point (pure: depends only on the arguments). */
function fitShadow(S, center, radius) {
  const sun = S.sun;
  sun.target.position.copy(center);
  sun.position.copy(center).addScaledVector(S.sunDir, radius * 4);
  const cam = sun.shadow.camera;
  cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
  cam.near = radius * 1.0; cam.far = radius * 8;
  cam.updateProjectionMatrix();
  sun.shadow.normalBias = radius * 0.0012;
  sun.target.updateMatrixWorld();
}

/**
 * The newborn's bedding: a creased linen sheet over a plank floor (both CC0 photo
 * materials), the sheet draped by a deterministic fold field and damp under the
 * hatchling, with curved fragments of the dark eggshell beside it. Indoors the light is a
 * photographed room with arched windows (Poly Haven old_room, CC0) plus the window's
 * daylight as a soft shadow-casting key.
 */
async function buildBed(ctx) {
  // the newborn on its nest: straw bedding round a folded linen pad (props library, Verdor kit),
  // the opened egg it came out of beside it, plank floor; a near-neutral window key and a cool
  // fill (warm light alone turned the gold copper)
  const g = new THREE.Group();
  const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.95, 0.88), 2.4);
  key.position.set(1.2, 1.6, 0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  Object.assign(key.shadow.camera, { left: -0.7, right: 0.7, top: 0.7, bottom: -0.7, near: 0.1, far: 6 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.002;
  key.target.position.set(0, 0.05, 0);
  const fill = new THREE.DirectionalLight(new THREE.Color(0.75, 0.85, 1.0), 0.35);
  fill.position.set(-1.0, 0.8, -0.6);
  fill.target.position.set(0, 0.05, 0);
  ctx.scene.add(key, key.target, fill, fill.target);
  g.userData.lights = [key, fill];
  const { verdorKit } = await import('../lib/props/verdor.js');
  const { frame, yawFrame } = await import('../lib/props/core.js');
  const vk = await verdorKit(ctx);
  g.add(vk.nest(frame([0, 0, 0]), { r: 0.82, rim: 0.14, count: 5200, seed: 5 }));
  const egg = vk.egg(yawFrame([-0.3, 0.035, -0.32], 0.9), { state: 'opened', seed: 11 });
  g.add(egg);
  const wood = await loadPBR('pbr/acg_planks21', ctx, { repeat: [2, 2] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wood);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.receiveShadow = true;
  g.add(floor);
  g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  g.userData.top = 0.056;                   // the top of the linen pad in the hollow
  // mucus strands from the chin to the bedding (rebuilt each frame from the posed jaw: pure in t)
  const slime = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.8, 0.74, 0.55), roughness: 0.06, metalness: 0, transparent: true, opacity: 0.42, clearcoat: 1, clearcoatRoughness: 0.04, depthWrite: false });
  g.userData.strands = [0, 1, 2].map((i) => {
    const geo = new THREE.TubeGeometry(new THREE.LineCurve3(new THREE.Vector3(), new THREE.Vector3(0, 1, 0)), 16, 1, 6, false);
    const m = new THREE.Mesh(geo, slime);
    m.frustumCulled = false; m.renderOrder = 2;
    g.add(m);
    return { m, i };
  });
  ctx.scene.add(g);
  return g;
}

/** Mucus strands between the newborn's chin / lip corner and the bedding (pure in the current pose). */
function updateStrands(bed, c) {
  if (!bed || !bed.userData.strands) return;
  const jb = c.bones[c.boneIndex.jaw];
  const bi = c.skeleton.boneInverses[c.boneIndex.jaw];
  const jp = c.anatomy.chains.jaw.points;
  const H = c.anatomy.head.H;
  const toW = (p) => new THREE.Vector3(...p).applyMatrix4(bi).applyMatrix4(jb.matrixWorld);
  const lerp = (a, b, f) => a.map((x, k) => x + (b[k] - x) * f);
  const starts = [lerp(jp[0], jp[1], 0.92), lerp(jp[0], jp[1], 0.62).map((x, k) => x + (k === 0 ? H * 0.16 : 0)), lerp(jp[0], jp[1], 0.75).map((x, k) => x - (k === 0 ? H * 0.12 : 0))];
  const ends = [[0.02, 0.0, 0.035], [0.05, 0.0, -0.01], [-0.035, 0.0, 0.02]];
  const radii = [0.0011, 0.0007, 0.0005];
  const top = bed.userData.top + 0.004;
  bed.userData.strands.forEach(({ m, i }) => {
    const a = toW(starts[i]);
    const b = new THREE.Vector3(a.x + ends[i][0], top, a.z + ends[i][2]);
    if (a.y - top < 0.003) { m.visible = false; return; }
    m.visible = true;
    const mid = a.clone().lerp(b, 0.5); mid.y -= (a.y - top) * 0.15;
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.TubeGeometry(curve, 16, 1, 6, false);
    // thin in the middle, thicker where it clings
    const pos = geo.attributes.position, nrm = geo.attributes.normal;
    for (let k = 0; k < pos.count; k++) {
      const seg = Math.floor(k / 7) / 16;
      const r = radii[i] * (0.45 + 0.55 * Math.pow(Math.abs(seg - 0.5) * 2, 1.5));
      const cp = curve.getPoint(seg);
      pos.setXYZ(k, cp.x + nrm.getX(k) * r, cp.y + nrm.getY(k) * r, cp.z + nrm.getZ(k) * r);
    }
    pos.needsUpdate = true;
    m.geometry.dispose();
    m.geometry = geo;
  });
}

/**
 * Break up texture tiling on a large ground: the albedo is sampled at two scales (the second
 * rotated) blended by low-frequency noise, and multiplied by macro colour variation.
 */
function breakTiling(mat) {
  const prev = mat.onBeforeCompile;
  mat.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGW;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGW = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vGW;
float gH(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float gN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(gH(i), gH(i + vec2(1, 0)), f.x), mix(gH(i + vec2(0, 1)), gH(i + vec2(1, 1)), f.x), f.y); }
float gF(vec2 p) { return gN(p) * 0.5 + gN(p * 2.1 + 3.7) * 0.3 + gN(p * 4.3 + 1.1) * 0.2; }`)
      .replace('#include <map_fragment>', `
#ifdef USE_MAP
{
  vec2 uv2 = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.29 + vec2(0.37, 0.11);
  vec4 t1 = texture2D(map, vMapUv), t2 = texture2D(map, uv2);
  float b = smoothstep(0.35, 0.65, gF(vGW.xz * 0.05));
  vec4 tc = mix(t1, t2, b);
  float macro = gF(vGW.xz * 0.012 + 5.0);
  vec3 tint = mix(vec3(1.06, 1.0, 0.86), vec3(0.88, 0.98, 0.9), gF(vGW.xz * 0.006 + 9.0));
  diffuseColor *= vec4(tc.rgb * tint * (0.72 + 0.5 * macro), tc.a);
}
#endif`);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => (key ? key() : '') + '|dk-ground';
  mat.needsUpdate = true;
}
