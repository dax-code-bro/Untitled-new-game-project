// Shot director set - SEA_COAST_DAWN (the PROLOGUE at sea, dawn): P-02 .. P-07.
//
// Built from the F1 style frame's world (scenes/lookdev/style-f1-prologue.js) and the nature
// library's prologue island in its dawn mist (scenes/lookdev/nature-island.js): a living FFT sea
// (Beaufort 5 from 110 deg), the basalt island 2 km out whose high ground disappears into a cloud cap,
// the low dawn sun hidden in a bank of sea cloud, sea fog lying on the water in layered banks.
// The vessel is the props library's prologue boat (a small double-ended clinker boat with a backlit
// wool sail) with three anonymous crew from the humans library; something vast passes INSIDE the
// mist (P-06): a shadow-only body in the sun's shadow map + a diffused silhouette - never a dragon.
//
// MAP (PROLOGUE frame, F1): the camera's home is near the origin looking NORTH (-z); the island
// centre (960, -2000); the sun low a little west of north (registry: sunDir(-0.5, 6)), veiled.
//   boat   set.boat = { at: [x, z], heading (deg, 0 = north, 90 = east), speed (m/s) }: crosses
//          LEFT -> RIGHT for a camera looking north (heading ~74, F1); bobs on the swell
//   camboat set.camBoat = { at, heading, speed, height }: a floating camera platform (rig 'boat',
//          mount: 'camboat'); it heaves and rolls with the sea under it
//   shape  set.shape = { at: [x, y, z], drift (m/s, +x), opacity (its diffused silhouette), bank }: the thing in the mist (P-06)
// Boat-local frame (the props boat): +x = bow, +z = port side? (z across the beam), y up from the
// waterline; actors aboard use `parent: 'boat'` and walk on the deck (groundIn).
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { loadHDRI } from '../../assets.js';
import { loadPrologueIsland } from '../../nature/island.js';
import { ISLAND } from '../../nature/island-world.js';
import { prologueBoat } from '../../props/boat.js';
import { createCreature, poses } from '../../creatures/index.js';
import { silhouetteCard } from '../../sets/fx.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { keyed } from '../timeline.js';

const I = ISLAND;
const SUN0 = new THREE.Vector3(-0.009, 0.105, -0.994).normalize();
const SUN_BANK = SUN0.clone().multiplyScalar(3000);
export const SHAPE_AT = [-55, 185, -1350];

export function cinematic() {
  return filmFinish({
    atmosphere: { enabled: true, haze: 2.2, mieG: 0.8, sunDirection: SUN0.toArray(), sunIlluminance: 5, apDistanceScale: 1.0, environment: false },
    volumetrics: {
      enabled: true, range: 3600, near: 1, resolution: [256, 96, 64], intensity: 1.5, noiseFilter: true, shadowSoftness: 12,
      density: 0.00030, heightFalloff: 0.016, fogBase: 0, anisotropy: 0.72, noiseScale: 0.006, noiseAmount: 0.75, wind: [3, 0, 1],
      banks: [
        // the island's cloud cap (nature-island.js)
        { center: [I.cx + 150, 560, I.cz - 40], radius: [1050, 210, 760], density: 0.028, noise: 0.9 },
        { center: [I.cx - 150, 500, I.cz + 80], radius: [650, 150, 450], density: 0.014, noise: 0.95 },
        { center: [I.cx + 600, 480, I.cz - 200], radius: [800, 150, 520], density: 0.011, noise: 0.95 },
        // the sea cloud the dawn sun sits behind
        { center: [SUN_BANK.x, SUN_BANK.y + 60, SUN_BANK.z], radius: [1700, 380, 600], density: 0.02, noise: 0.95 },
        { center: [SUN_BANK.x + 250, SUN_BANK.y - 160, SUN_BANK.z + 200], radius: [1600, 220, 520], density: 0.007, noise: 1.0 },
        // the high mist the shape moves in (F1)
        { center: [SHAPE_AT[0] + 20, 115, -780], radius: [700, 100, 640], density: 0.0038, noise: 0.55 },
        // sea fog lying on the water in layered banks
        { center: [I.cx - 200, 30, I.cz + 640], radius: [1500, 60, 330], density: 0.011, noise: 0.9 },
        { center: [-300, 9, -1250], radius: [1600, 26, 300], density: 0.008, noise: 0.9 },
      ],
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 1.5 },
    dof: { samples: 40 },
    grade: { whiteBalance: 3800, contrast: 1.06, saturation: 0.85, exposure: -1.25 },
  });
}

const D2R = Math.PI / 180;
/** heading (deg, 0 = north) -> unit [x, z] */
const dirOf = (h) => [Math.sin(h * D2R), -Math.cos(h * D2R)];

export async function build(ctx, { shotSpecs }) {
  const { scene, camera } = ctx;
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  // sun: low, veiled; its shadow map covers the near sea, the boat and the high mist bank
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(draft ? 2048 : 4096, draft ? 2048 : 4096);
  // it must cover the whole island, its cloud cap and the near sea: where the fog leaves the shadow
  // camera it is lit unshadowed (first renders: a hard-edged bright box under the island)
  const sc = sun.shadow.camera; sc.left = -3200; sc.right = 3200; sc.top = 2600; sc.bottom = -2600; sc.near = 10; sc.far = 9000;
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 1.2;
  scene.add(sun, sun.target);
  // reflections and sky fill from a real misty dawn (CC0 HDRI kloppenheim_01), its veiled sun turned
  // onto this scene's sun (F1)
  const env = await loadHDRI('hdri/kloppenheim_01', ctx, { extractSun: true, sunThreshold: 30 });
  env.apply(scene, { background: false, environment: true, sunLight: false });
  const az0 = env.sun ? Math.atan2(env.sun.direction.z, env.sun.direction.x) : 0;
  scene.environmentRotation.set(0, az0 - Math.atan2(SUN0.z, SUN0.x), 0);
  scene.environmentIntensity = 0.45;

  const ocean = createOcean(ctx, { windSpeed: 8.5, windDirection: 110, swell: 0.45, choppiness: 1.35, seed: 21, fetch: 60000, foamAmount: 1.0, foamThreshold: 0.62, foamColor: [0.74, 0.72, 0.68], shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.9, mipFilter: 'trilinear', roughness: 0.06, reflectionTint: [1.35, 1.08, 0.78], deepColor: [0.006, 0.012, 0.014] });
  scene.add(ocean.mesh);
  const isl = await loadPrologueIsland(ctx, { views: [[0, 3, 0]], castShadow: true });
  scene.add(isl.group);

  // the vessel (crew are the shots' actors, parented to it)
  const boat = await prologueBoat(ctx, { brace: -0.42, sail: 'prologue_full', crew: [] });
  boat.root.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(boat.root);
  // a floating camera platform
  const camboat = new THREE.Group(); camboat.name = 'camboat'; scene.add(camboat);

  // the shape in the mist (F1): an invisible giant body that casts into the sun's shadow map, and a
  // heavily diffused silhouette where it is. Built only if a shot uses it.
  let shape = null, card = null;
  if (Object.values(shotSpecs).some((s) => s.set?.shape)) {
    shape = await createCreature('charcoal', { quality: 'draft' });
    shape.root.scale.setScalar(3.6);
    shape.setPose(poses.glide(shape, { t: 0, bank: -0.25, dihedral: 0.18 }));
    shape.root.position.set(...SHAPE_AT);
    shape.root.rotation.set(0.05, -Math.PI / 2 - 0.35, 0);
    card = silhouetteCard(ctx, shape.root, new THREE.Vector3(0, 2.6, -4), { size: [1024, 512], blur: 40, opacity: 0.26, color: [0, 0, 0], pad: 1.6 });
    scene.add(card.mesh, shape.root);
    shape.root.traverse((o) => {
      if (!o.isMesh) return;
      o.castShadow = true; o.receiveShadow = false; o.frustumCulled = false;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) { m.colorWrite = false; m.depthWrite = false; }
    });
    shape.root.visible = false; card.mesh.visible = false;
  }
  camera.near = 0.05; camera.far = 40000; camera.updateProjectionMatrix();

  const _e = new THREE.Euler();
  /** float a platform on the sea: centre (x, z), heading h (deg), length / beam for the four-point fit */
  const float = (obj, x, z, h, L, B, sink, damp = 0.8) => {
    const [hx, hz] = dirOf(h);
    const bow = ocean.heightAt(x + (L / 2) * hx, z + (L / 2) * hz), stern = ocean.heightAt(x - (L / 2) * hx, z - (L / 2) * hz);
    const port = ocean.heightAt(x + (B / 2) * hz, z - (B / 2) * hx), stbd = ocean.heightAt(x - (B / 2) * hz, z + (B / 2) * hx);
    obj.position.set(x, (bow + stern + port + stbd) * 0.25 - sink, z);
    _e.set(Math.atan2(port - stbd, B) * damp, (90 - h) * D2R, Math.atan2(bow - stern, L) * damp, 'YXZ');
    obj.quaternion.setFromEuler(_e);
    obj.updateMatrixWorld(true);
  };
  const along = (o, t) => {
    const h = keyed(t, o.heading ?? 74), v = o.speed ?? 0, [dx, dz] = dirOf(h);
    const a = keyed(t, o.at || [0, 0]);
    return { x: a[0] + dx * v * t, z: a[1] + dz * v * t, h };
  };

  const marks = {
    island: [I.cx, 250, I.cz], islandShore: [I.cx - 300, 60, I.cz + 600], shape: [...SHAPE_AT], horizon: [0, 2, -4000],
    sunBank: [SUN_BANK.x, SUN_BANK.y, SUN_BANK.z],
  };
  return {
    marks, objects: { boat: boat.root, camboat }, ground: () => 0,
    /** deck height under a boat-local point (actors aboard) */
    groundIn: (parent, x, z) => (parent === 'boat' ? boat.standAt(x, z).y : 0),
    point(name) {
      // boat-local points: 'boat.mast', 'boat.bow', 'boat.stern', 'boat.rail' (world, as posed now)
      const m = /^boat\.(\w+)$/.exec(name);
      if (!m) return null;
      const L = { mast: [0.2, 3.5, 0], bow: [4.6, 1.2, 0], stern: [-4.4, 1.2, 0], rail: [-0.6, 0.95, 1.2], sail: [0.3, 4.2, 0], hull: [0, 0.4, 0] }[m[1]];
      return L ? new THREE.Vector3(...L).applyMatrix4(boat.root.matrixWorld) : null;
    },
    applyShot(info) {
      const st = info.spec.set || {}, t = info.local;
      ocean.update(info.t);
      // the boat
      const b = st.boat || { at: [-30, -120], heading: 74, speed: 2.6 };
      const bp = along(b, t);
      float(boat.root, bp.x, bp.z, bp.h, 8, 2.4, 0.06, 0.7);
      const [hx, hz] = dirOf(bp.h);
      ocean.setWake(0, { x: bp.x - 4.6 * hx, z: bp.z - 4.6 * hz, heading: [hx, hz], hullLength: 9.6, beam: 2.7, strength: (b.speed ?? 0) > 0.2 ? 0.7 : 0.15, length: 45 });
      // the camera platform
      if (st.camBoat) { const c = along(st.camBoat, t); float(camboat, c.x, c.z, c.h, st.camBoat.length ?? 5, st.camBoat.beam ?? 2, -(st.camBoat.height ?? 0), st.camBoat.damp ?? 0.6); }
      // the sun (continuity): veiled behind the sea cloud, so its 2.2 km shadow map (soft, coarse) is enough
      const S = new THREE.Vector3(...(info.cont.sun || SUN0.toArray())).normalize();
      sun.target.position.set(I.cx - 400, 100, I.cz + 600);
      sun.position.copy(sun.target.position).addScaledVector(S, 3000);
      sun.intensity = 2.2 * (st.sun ?? 1);
      // the shape in the mist
      if (shape) {
        const sh = st.shape || null;
        shape.root.visible = card.mesh.visible = !!sh;
        if (sh) {
          const a = sh.at || SHAPE_AT, drift = (sh.drift ?? -9) * t;
          shape.root.position.set(a[0] + drift, a[1], a[2]);
          card.mesh.position.set(card.center.x + (a[0] - SHAPE_AT[0]) + drift, card.center.y + (a[1] - SHAPE_AT[1]), card.center.z + (a[2] - SHAPE_AT[2]));
          if (sh.opacity != null && card.mesh.material) card.mesh.material.opacity = sh.opacity;
          shape.root.updateMatrixWorld(true);
        }
      }
    },
    afterCamera(info) { if (card?.mesh.visible) card.face(info.ctx.camera.position); },
    dynamic(info) { const d = [boat.root]; if (shape?.root.visible) d.push(shape.root); return d; },
  };
}
