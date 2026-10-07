// Hero look-development shots for the Episode 1 creatures (PROVISIONAL designs).
// Used by creatures-hero.js (every shot), creatures-review.js (1 s per shot, fast checks)
// and the per-creature wrappers creatures-turntable-<name>.js, which build only what
// their shots need. The all-creature contact sheet is creatures-contact.js.
//
// Every shot is framed like a real camera setup: a lens in mm on a Super 35 sensor, a stop,
// the focus on the subject's eye or body, a 180-degree shutter (true sub-frame motion blur
// with the film finish), the photographed sky as the only light (Poly Haven
// kloofendal_48d_partly_cloudy, CC0: its sun extracted into a shadow-casting light with the
// measured energy, or old_room's window light indoors). Sets:
//   field  open grassland (CC0 photo turf + geometry grass tufts around the subject and in
//          front of the camera), the dragon on the ground in daylight
//   air    the sky and the open sea 150-300 m below (the runtime's FFT ocean), hazed by the atmosphere
//   ground a camera on the ground looking up at a flyer, a person in the foreground
//   bed    a creased linen sheet over planks with eggshell shards, indoor window light
// Camera and people positions are metres in the subject's frame (x = its left, y = up,
// z = forward); `face` turns the subject relative to the sun's azimuth (0 = facing the sun,
// -90 = its LEFT side to the sun). Every frame is a pure function of t.
import * as THREE from 'three';
import { loadHDRI, loadPBR } from '../lib/assets.js';
import { createCreature, poses, loadHuman as loadPlaceholderHuman, createRider as createPlaceholderRider, createSaddle, mountRider } from '../lib/creatures/index.js';
import { grassField } from '../lib/sets/grass.js';
import { filmFinish } from './finish.js';

const D2R = Math.PI / 180;

export const SHOTS = [
  // Charcoal 3/4 front in daylight: the sun rakes across his left side so the scale relief
  // reads; Remi stands by the left forefoot for scale (32 mm from 64 m, eye height)
  { id: 'charcoal-front', set: 'field', creatures: ['charcoal'], tack: ['charcoal'], dur: 3, face: -55,
    people: [{ id: 'remi', at: [8, 0, 12.5], yaw: 55 }],
    pose: { charcoal: { name: 'stand', look: [0.14, -0.04], jaw: 0.02 } },
    cam: { subject: 'charcoal', pos: [27, 1.7, 41], target: [1, 7.5, 4], mm: 35, fstop: 8, focus: 'target' } },
  // Charcoal's head: 85 mm close-up on the eye
  { id: 'charcoal-head', set: 'field', creatures: ['charcoal'], dur: 3, face: -55,
    pose: { charcoal: { name: 'stand', look: [0.3, 0.0] } },
    cam: { subject: 'charcoal', bone: 'head', pos: [12.5, 1.6, 11.5], target: [0.3, -0.4, 1.7], mm: 50, fstop: 5.6, focus: 'eye_L' } },
  // Charcoal flying side-on (air to air, 40 mm from ~75 m, the downstroke)
  { id: 'charcoal-flight', set: 'air', creatures: ['charcoal'], tack: ['charcoal'], dur: 3, alt: 260, face: -100,
    pose: { charcoal: { name: 'flight', phase: 0.5, look: [0.05, 0.05] } },
    cam: { subject: 'charcoal', pos: [74, 3, 6], target: [0, 0, 2], mm: 40, fstop: 8, focus: 'target' } },
  // Leaf sitting upright like a dog, Abby beside his chest (40 mm, eye height, f/4)
  { id: 'leaf-abby', set: 'field', creatures: ['leaf'], tack: ['leaf'], dur: 3, face: -70,
    people: [{ id: 'abby', at: [2.1, 0, 0.9], yaw: 70 }],
    pose: { leaf: { name: 'sit', look: [0.35, -0.12], eyes: [0.1, -0.05] } },
    cam: { subject: 'leaf', pos: [8.0, 1.55, 9.5], target: [0.6, 1.75, 0.6], mm: 35, fstop: 5.6, focus: 'target' } },
  // Leaf flying with Abby riding (50 mm air to air, slightly above, behind the shoulder)
  { id: 'leaf-flight', set: 'air', creatures: ['leaf'], riders: { leaf: 'abby' }, dur: 3, alt: 160, face: -110,
    // (mid-downstroke: the membrane is cambered between the fingers)
    pose: { leaf: { name: 'flight', corr: 1, phase: 0.3, look: [-0.25, 0.05] } },
    cam: { subject: 'leaf', pos: [14.5, 3.6, 6.5], target: [0, 0.9, 0.2], mm: 40, fstop: 8, focus: 'target' } },
  // Starlight gliding past a distant watchtower, seen from the ground (~260 m away, ~60 m up):
  // the tower (25 m) is as far away as she is, so her span reads as eight towers wide; a
  // watchman in the foreground points up at her; the haze between softens both
  { id: 'starlight-below', set: 'ground', creatures: ['starlight'], tack: ['starlight'], dur: 3, face: 160, haze: 2.4,
    flyer: { name: 'starlight', at: [-22, 45, 268], heading: -80 },
    tower: { at: [10, 0, 252], r: 3.6, h: 21, capH: 6.5 }, trees: true,
    people: [{ id: 'watchman', ground: [-0.95, 0, 4.6], yaw: -12 }],
    pose: { starlight: { name: 'glide', bank: -0.08, dihedral: 0.1, look: [0.1, -0.15] } },
    cam: { ground: true, pos: [0, 1.0, 0], lookAt: [-6, 37.8, 262], mm: 40, fstop: 8 } },
  // the gold hatchling on the bedding: 100 mm macro, T2.8, focus on the eye
  { id: 'hatchling-macro', set: 'bed', creatures: ['hatchling'], dur: 3, face: -40,
    pose: { hatchling: { name: 'lie', raise: -0.1, headDown: 0.16, look: [0.42, -0.04], lidRelax: 0.42, breathe: 0.5 } },
    cam: { subject: 'hatchling', bone: 'head', pos: [0.45, 0.2, 0.62], target: [0.02, -0.03, -0.06], mm: 100, fstop: 8, focus: 'eye_L' } },
  // the Slitherwing scout banking hard at speed (tracking, 45 mm)
  // (the species study: no rider - a seated adult is as long as the scout's whole trunk and hides
  // it; the rider appears, small, in the wing-loss shot)
  { id: 'scout-bank', set: 'air', creatures: ['scout'], dur: 3, alt: 200, face: -130,
    pose: { scout: { name: 'glide', bank: 0.85, look: [0.3, 0.0], dihedral: 0.05 } },
    cam: { subject: 'scout', pos: [5.5, 2.2, 6.0], target: [0, 0, 0.4], mm: 45, fstop: 8, focus: 'target' } },
  // the scout loses its LEFT wing (0.4 s after the tear): the wing tumbles away in the wake
  // (the camera tracks the midpoint between the falling body and the tumbling wing, without
  // the body's roll; the wing separates in silhouette, no close-up of the wound)
  { id: 'scout-wingloss', set: 'air', creatures: ['scout'], riders: { scout: 'scout' }, dur: 4, alt: 200, face: -130, detachAt: 0.6, still: 1.1,
    pose: { scout: { name: 'flight' } },
    cam: { subject: 'scout', track: 'wingloss', pos: [9.5, 3.0, -1.0], target: [0, -0.3, 0], mm: 24, fstop: 8, focus: 'target' } },
];

/** Build a scene module for the given shot ids (default: all). */
export function makeTurntable(opts = {}) {
  const shots = SHOTS.filter((s) => !opts.only || opts.only.includes(s.id)).map((s) => ({ ...s, ...(opts.step ? { dur: opts.step } : {}) }));
  let start = 0;
  for (const s of shots) { s._start = start; start += s.dur; }
  const total = start;
  const need = [...new Set(shots.flatMap((s) => s.creatures))];
  const needSets = new Set(shots.map((s) => s.set));
  const S = { C: {}, riders: {}, tacks: {}, people: [], sun: null, sunDir: null, sky: null, ground: null, grass: null, bed: null };

  const meta = {
    title: opts.title || 'Creature hero shots (provisional designs)', duration: total, seed: 7,
    // the shared photographic finish (8 sub-frames: supersampling + true motion blur), aerial
    // haze from the photographed sky; use --cinematic preview for fast checks
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
      // the photographer's horizon (a suburb) is matte-painted out with a haze band
      const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: opts.hdriRotation ?? -1.2, horizonFill: { above: 4, below: -2, blend: 2 } });
      S.sky = sky;
      const sun = sky.apply(scene);
      sun.castShadow = true;
      sun.shadow.mapSize.set(quality.shadowMapSize, quality.shadowMapSize);
      sun.shadow.bias = -0.0002;
      scene.add(sun, sun.target);
      S.sun = sun; S.sunDir = sky.sun.direction.clone();
      // open land to the horizon (the air shots fly over it, hazed by the atmosphere)
      const groundMat = await loadPBR('pbr/acg_ground13', ctx, { worldSize: 16000 });
      breakTiling(groundMat);
      const ground = new THREE.Mesh(new THREE.CircleGeometry(9000, 256), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);
      S.ground = ground;
    }
    // the air shots fly over the sea off the coast (as the episode's flights and the pursuit
    // do): the runtime's FFT ocean, which follows the camera, instead of a tiled ground plane
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
    // a stone watchtower for scale (shared set kit), shown only in the shots that ask for it
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
    // countryside for the ground shots: hedgerows and copses from 400 m to the horizon
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
    // grass around the field subjects and in front of the camera (built once per subject)
    if (needSets.has('field')) {
      S.grass = {};
      for (const s of shots.filter((x) => x.set === 'field')) {
        const name = s.creatures[0];
        if (S.grass[name]) continue;
        const g = fieldGrass(S, s);
        g.visible = false;
        scene.add(g);
        S.grass[name] = g;
      }
    }
    // people: the humans library's cast builds when present, else the placeholder rider
    const ppl = shots.flatMap((s) => (s.people || []).map((p) => p.id));
    const riderOutfits = shots.flatMap((s) => Object.values(s.riders || {}));
    const H = (ppl.length || riderOutfits.length) ? await loadPeople(ppl, riderOutfits) : null;
    for (const s of shots) {
      for (const n of s.tack || []) if (!S.tacks[n]) S.tacks[n] = createSaddle(S.C[n], {});
      for (const [n, outfit] of Object.entries(s.riders || {})) {
        if (S.riders[n]) continue;
        const tack = S.tacks[n] || (S.tacks[n] = createSaddle(S.C[n], {}));
        const rider = H.rider(outfit, outfit === 'scout' ? { lean: 0.5 } : {});
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
  const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
  const toWorld = (c, p) => new THREE.Vector3(p[0], p[1], p[2]).applyQuaternion(c.root.quaternion).add(c.root.position);

  function update(t, ctx) {
    const { camera, scene } = ctx;
    let shot = shots[shots.length - 1];
    for (const s of shots) if (t >= s._start && t < s._start + s.dur) { shot = s; break; }
    // review renders (opts.step) show each shot at its representative moment
    const lt = opts.step ? (shot.still ?? 0) + (t - shot._start) : t - shot._start;
    // visibility
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
    if (S.grass) for (const [n, g] of Object.entries(S.grass)) g.visible = shot.set === 'field' && shot.creatures[0] === n;
    if (S.bed && S.bed.userData.lights) for (const l of S.bed.userData.lights) l.visible = shot.set === 'bed';
    if (S.sun) S.sun.visible = shot.set !== 'bed';
    // the photographed sky outdoors, the photographed room (window light) indoors
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
        c.root.rotation.y = (shot.flyer.heading ?? 0) * D2R;
      }
      c.root.updateMatrixWorld(true);
    }
    // scout: the LEFT wing tears away at detachAt and tumbles; the body rolls toward the lost side
    if (shot.detachAt !== undefined) scoutWingLoss(S.C.scout, shot, lt, faceYaw, scene);
    for (const r of Object.values(S.riders)) r.rider.update?.(lt);
    // people
    for (const p of shot._people || []) {
      const h = p.h;
      if (p.ground) {       // world position (ground-camera shots)
        h.place(p.ground[0], 0, p.ground[2], (p.yaw ?? 0) * D2R);
      } else {
        const c = S.C[shot.creatures[0]];
        const w = toWorld(c, p.at);
        h.place(w.x, 0, w.z, c.root.rotation.y + (p.yaw ?? 180) * D2R);
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
      const c = S.C[shot.creatures[0]];
      camFocus.copy(c.root.position);
    } else {
      const c = S.C[cm.subject];
      c.root.updateMatrixWorld(true);
      let base = c.root.position.clone(), q = c.root.quaternion;
      if (cm.bone) { base = new THREE.Vector3().setFromMatrixPosition(c.bones[c.boneIndex[cm.bone]].matrixWorld); }
      if (cm.track === 'wingloss' && c.detachable) {
        // midpoint of the body and the torn wing, in the heading frame (no roll)
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
    // the sun's shadow frustum around what the camera looks at
    if (S.sun) {
      const c = S.C[shot.creatures[0]];
      const R = shot.set === 'field' ? c.L * 0.9 : c.L * 0.75;
      fitShadow(S, cm.ground ? c.root.position.clone() : (cm.bone ? c.root.position.clone().add(new THREE.Vector3(0, c.L * 0.15, 0)) : target.clone()), R);
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
    if (ctx.cinematic?.ao) ctx.cinematic.ao.radius = Math.max(0.01, S.C[shot.creatures[0]].L * 0.03);
  }
  return { meta, setup, update, shots };
}

/** The scout's LEFT wing tears away at shot.detachAt and tumbles in the wake (pure in lt). */
function scoutWingLoss(c, shot, lt, faceYaw, scene) {
  const td = shot.detachAt;
  if (lt < td) return;
  c.setPose(poses.flight(c, { t: td }));
  c.root.updateMatrixWorld(true);
  const M0 = c.detachable.rootBone.matrixWorld.clone();
  const dt = lt - td;
  const fwd = new THREE.Vector3(Math.sin(faceYaw), 0, Math.cos(faceYaw));
  // the body: the right wing beats on, the body rolls toward the lost (left) side and drops
  c.setPose(poses.flight(c, { t: lt, bank: 0.55 * dt + 0.2, amp: 0.6 }));
  c.root.position.y = (shot.alt ?? 0) - 0.5 * 9.81 * dt * dt * 0.3;
  c.root.position.addScaledVector(fwd, 7 * dt);
  c.root.rotateZ(1.4 * dt);
  // the wing: ballistic, tumbling, left behind in the wake
  const side = new THREE.Vector3(Math.cos(faceYaw), 0, -Math.sin(faceYaw));
  const g = side.multiplyScalar(1.1 * dt).addScaledVector(fwd, -2.5 * dt).add(new THREE.Vector3(0, -0.5 * 9.81 * dt * dt * 0.25, 0));
  const spin = new THREE.Quaternion().setFromEuler(new THREE.Euler(2.0 * dt, 0.7 * dt, 2.6 * dt));
  const p = new THREE.Vector3().setFromMatrixPosition(M0);
  const M = new THREE.Matrix4().compose(p.add(g), new THREE.Quaternion().setFromRotationMatrix(M0).premultiply(spin), new THREE.Vector3(1, 1, 1));
  c.detachWing(scene, M);
  // the torn wing goes limp: half folded
  for (const n of ['w_L_1', 'w_L_2']) { const b = c.bones[c.boneIndex[n]]; b.quaternion.setFromEuler(new THREE.Euler(0, n === 'w_L_1' ? -0.9 : 0.8, 0.3)); }
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
  const d = Math.hypot(cx, cz);
  const dirA = Math.atan2(-cx, -cz);                       // camera -> subject
  const rMin = 1.2, rMax = d + L * 0.7;
  const half = (Math.atan(24.89 / 2 / cam.mm) + 0.25);
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
  const g = new THREE.Group();
  const top = 0.06;
  const key = new THREE.DirectionalLight(new THREE.Color(1.0, 0.86, 0.68), 2.6);
  key.position.set(1.2, 1.6, 0.6);
  key.castShadow = true;
  key.shadow.mapSize.set(ctx.quality.shadowMapSize, ctx.quality.shadowMapSize);
  Object.assign(key.shadow.camera, { left: -0.6, right: 0.6, top: 0.6, bottom: -0.6, near: 0.1, far: 6 });
  key.shadow.bias = -0.0003; key.shadow.normalBias = 0.002;
  key.target.position.set(0, top, 0);
  ctx.scene.add(key, key.target);
  g.userData.lights = [key];
  const linen = await loadPBR('pbr/acg_fabric36', ctx, { repeat: [5, 5], color: new THREE.Color(0.86, 0.82, 0.74), sheen: { color: 0xffffff, roughness: 0.5 } });
  linen.side = THREE.DoubleSide;
  const n = 220, size = 1.6;
  const sheet = new THREE.PlaneGeometry(size, size, n, n);
  sheet.rotateX(-Math.PI / 2);
  const p = sheet.attributes.position;
  const fold = (x, z) => {
    let h = 0.025 * Math.sin(x * 3.1 + 0.6 * Math.sin(z * 2.3)) * Math.cos(z * 2.2 + 0.4)
      + 0.012 * Math.sin(x * 7.3 + z * 3.1) + 0.006 * Math.sin(z * 13.0 + x * 4.0);
    for (const [cx, cz, a, w] of [[0.1, -0.2, 0.7, 0.02], [-0.3, 0.15, -0.4, 0.015], [0.35, 0.3, 1.9, 0.018]]) {
      const u = (x - cx) * Math.cos(a) + (z - cz) * Math.sin(a);
      h += 0.014 * Math.exp(-(u * u) / (w * w)) * (0.6 + 0.4 * Math.sin(x * 9 + z * 5));
    }
    h -= 0.018 * Math.exp(-(x * x + z * z) / 0.04);         // a hollow where the hatchling lies
    return h;
  };
  for (let i = 0; i < p.count; i++) p.setY(i, top + fold(p.getX(i), p.getZ(i)));
  sheet.computeVertexNormals();
  const sh = new THREE.Mesh(sheet, linen);
  sh.receiveShadow = true; sh.castShadow = true;
  g.add(sh);
  const wood = await loadPBR('pbr/acg_planks21', ctx, { repeat: [2, 2] });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 6), wood);
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.002; floor.receiveShadow = true;
  g.add(floor);
  // eggshell fragments: thick curved shards, dark outside, pale membrane inside
  const shellMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.05, 0.045, 0.04), roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.4, side: THREE.DoubleSide });
  const frags = [[0.2, -0.05, 0.6], [0.24, 0.1, 2.0], [-0.05, 0.22, 3.4], [0.15, 0.2, 4.4]];
  frags.forEach(([x, z, r], i) => {
    const sg = new THREE.SphereGeometry(0.11, 18, 10, r, 0.9 + 0.3 * Math.sin(i * 2.1), 0.5 + 0.3 * Math.cos(i), 0.6 + 0.2 * Math.sin(i * 3.3));
    const m = new THREE.Mesh(sg, shellMat);
    m.position.set(x, top + 0.02 + fold(x, z), z);
    m.rotation.set(1.2 + i * 0.7, r, 0.4 * i);
    m.castShadow = m.receiveShadow = true;
    g.add(m);
  });
  g.userData.top = top - 0.012;
  ctx.scene.add(g);
  return g;
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
