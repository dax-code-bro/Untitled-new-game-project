// Shot director set - PROLOGUE_VISTAS (the prologue's dissolving landscapes): P-08 .. P-16.
//
// "Prologue dissolves: coastal settlement, open sea, forest reaching a cliff, distant fortified walls,
// far unreached islands, wing-shaped cloud. Built from the same terrain/sea generators as the other
// sets. No map, no borders." (shotlist.json sets). Every landscape is its own LOCATION group, built
// around the origin; a shot shows only its location (set.loc), so one browser setup renders all nine
// shots and no landscape can appear in another's background. Three seas (FFT oceans with different
// spectra) - only the shot's sea is drawn and evolved.
//
// Locations (set.loc) - PROVISIONAL production designs, nothing here is canon geography:
//   settlement  (P-08) a fishing settlement on a slope above a shingle shore, dawn, from the water
//   (open sea)  (P-09) the settlement location looking away from the land: sea to the horizon
//   forest      (P-10, caption TARA) dark sandstone sea cliff, oak and pine wood to its very edge
//   walls       (P-11, caption SCRAPPER) a curtain wall with round towers along a far ridge, inland
//   verdor      (P-12, caption VERDOR) a pale flat-topped limestone island alone on the sea, in mist
//   calm        (P-13, caption CITADEL SEA) calm water under a high bright sky, no coast
//   swell       (P-14, caption PROXY SEA) a long swell under low cloud, a different sea and light
//   islands     (P-15) far, unreached islands on the horizon at dawn
//   sky         (P-16) a wing-shaped cloud drifting across a brightening morning sky
// Frame: y up, -z = north; the camera's home is near the origin. Light per shot from the registry
// continuity (PROLOGUE_VISTAS perShot: P-13 high day, P-14 low cloud, P-16 first clear sun).
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { heightfield, makeNoise, smooth, gradedAxis } from '../../sets/terrain.js';
import { terrainMaterial } from '../../sets/materials.js';
import { buildingKit } from '../../sets/buildings.js';
import { scatter, bushGeometry, rockGeometry, foliageMaterial } from '../../sets/scatter.js';
import { Kit, yawFrame, frame } from '../../architecture/core.js';
import { archMaterials } from '../../architecture/materials.js';
import { house } from '../../architecture/house.js';
import { treeKit, scatterTrees } from '../../nature/trees.js';
import { mulberry } from '../../nature/noise.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { keyed, clamp } from '../timeline.js';
import { paintWingCloud } from './wing-cloud.js';
import { paintCloudDeck, paintCloudDetail } from './cloud-deck.js';
import { fieldsVoronoi, FIELD_USE, landUse, hedgePlacements } from './farmland.js';

export function cinematic() {
  return filmFinish({
    atmosphere: { enabled: true, haze: 2.4, mieG: 0.8, sunDirection: null, sunIlluminance: 5, apDistanceScale: 1.0, environment: true },
    volumetrics: {
      enabled: true, range: 4000, near: 1, resolution: [240, 96, 64], intensity: 1.3, noiseFilter: true, shadowSoftness: 8,
      density: 0.0002, heightFalloff: 0.02, fogBase: 0, anisotropy: 0.72, noiseScale: 0.006, noiseAmount: 0.75, wind: [3, 0, 1], banks: [],
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 2.0 },
    dof: { samples: 24 },
    grade: { whiteBalance: 4600, contrast: 1.06, saturation: 0.88, exposure: 0 },
  });
}

const D2R = Math.PI / 180;
const sunVec = (az, el) => new THREE.Vector3(Math.sin(az * D2R) * Math.cos(el * D2R), Math.sin(el * D2R), -Math.cos(az * D2R) * Math.cos(el * D2R));

/** Per-location look: fog banks, haze, fog density, the sea, white balance, exposure trim. */
const LOOKS = {
  // P-09 (the settlement location looking out to sea, south) under a dawn altocumulus deck (`set.clouds`):
  // south of the home only (P-08 looks north under a clear sky), lit warm on the sun side
  settlement: { sea: 'dawn', haze: 4.5, density: 0.00022, wb: 4500, exposure: 1.5,
    deck: { when: 'clouds', y: 3500, size: 160000, tile: 14000, detail: 1250, center: [0, 80000], home: [0, 300], yaw: -25, color: [0.95, 0.86, 0.82], edgeFade: 0.3,
      glow: { az: 95, power: 1.5, sun: [1.7, 1.25, 0.85], away: [0.8, 0.85, 0.95] },
      paint: { open: [-0.12, 0.22], radius: 0.6, soft: 0.2, core: 0.62, thin: 1.0, cells: [29, 41], sub: [73, 103] } },
    banks: (S) => [
    { center: [S.x * 3000, S.y * 3000 + 60, S.z * 3000], radius: [1800, 360, 600], density: 0.02, noise: 0.95 },
    { center: [200, 70, -900], radius: [1200, 45, 300], density: 0.004, noise: 0.95 },
    { center: [-500, 6, 400], radius: [900, 10, 200], density: 0.002, noise: 0.95 }] },
  forest: { sea: 'dawn', haze: 4.0, density: 0.0002, wb: 4600, exposure: 1.4, banks: (S) => [
    { center: [S.x * 3000, S.y * 3000 + 60, S.z * 3000], radius: [1800, 360, 600], density: 0.02, noise: 0.95 },
    { center: [-400, 5, 300], radius: [800, 9, 160], density: 0.002, noise: 0.95 }] },
  walls: { sea: null, haze: 4.5, density: 0.00025, wb: 4700, exposure: 1.6, banks: () => [
    { center: [-300, 30, -450], radius: [900, 25, 200], density: 0.0012, noise: 0.95 }] },
  verdor: { sea: 'dawn', haze: 4.0, density: 0.00015, wb: 4800, exposure: 1.4, banks: () => [
    { center: [-200, 30, -1900], radius: [2200, 35, 300], density: 0.006, noise: 0.9 }] },
  calm: { sea: 'calm', haze: 1.2, density: 0.00004, wb: 6000, exposure: 2.1, banks: () => [] },
  // the low cloud is a painted deck (cloud-deck.js): a froxel bank at 620 m averaged to a flat grey
  // ceiling over 16 km (and drew a pale wall where it ended on the horizon)
  swell: { sea: 'swell', haze: 3.4, density: 0.00018, wb: 5000, exposure: -0.2, range: 16000, banks: () => [],
    deck: { y: 520, size: 64000, tile: 20000, detail: 1250, center: [-24000, 8000], yaw: 20, color: [1, 1, 1], veil: [0.8, 0.82, 0.86] } },
  islands: { sea: 'dawn', haze: 3.0, density: 0.0001, wb: 4400, exposure: 1.3, banks: (S) => [
    { center: [S.x * 6000, S.y * 6000 + 80, S.z * 6000], radius: [2600, 420, 800], density: 0.016, noise: 0.95 },
    { center: [0, 30, -9000], radius: [9000, 40, 1500], density: 0.002, noise: 0.9 }] },
  sky: { sea: 'dawn', haze: 1.8, density: 0.00006, wb: 5600, exposure: 1.7, banks: () => [] },
};

export async function build(ctx, { shotSpecs }) {
  const { scene, camera } = ctx;
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  const used = new Set(Object.values(shotSpecs).map((s) => s.set?.loc).filter(Boolean));
  const sun = new THREE.DirectionalLight(0xffffff, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(draft ? 2048 : 4096, draft ? 2048 : 4096);
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 1.0;
  scene.add(sun, sun.target);
  camera.near = 0.5; camera.far = 60000; camera.updateProjectionMatrix();

  // ---- the seas (only the ones the shots use)
  const seaOpts = {
    dawn: { windSpeed: 8.0, windDirection: 110, swell: 0.45, choppiness: 1.3, seed: 21, fetch: 60000, foamThreshold: 0.64, reflectionTint: [1.3, 1.08, 0.82], deepColor: [0.006, 0.012, 0.014] },
    calm: { windSpeed: 3.2, windDirection: 200, swell: 0.25, choppiness: 0.9, seed: 31, fetch: 20000, foamThreshold: 0.8, deepColor: [0.004, 0.016, 0.024] },
    swell: { windSpeed: 6.0, windDirection: 250, swell: 1.4, choppiness: 1.0, seed: 41, fetch: 200000, foamThreshold: 0.7, deepColor: [0.006, 0.011, 0.012] },
  };
  const seas = {};
  for (const loc of used) {
    const k = LOOKS[loc]?.sea;
    if (k && !seas[k]) {
      seas[k] = createOcean(ctx, { ...seaOpts[k], foamAmount: 1.0, shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.8, mipFilter: 'trilinear', roughness: 0.06 });
      seas[k].mesh.visible = false;
      scene.add(seas[k].mesh);
    }
  }
  const terrainMats = {
    dark: (o = {}) => terrainMaterial(ctx, [
      { id: 'pbr/acg_rock26', scale: 6, tint: [0.36, 0.33, 0.3] },
      { id: 'pbr/acg_ground13', scale: 8, tint: [0.42, 0.46, 0.34] },
      { id: 'pbr/acg_ground24', scale: 8, tint: [0.5, 0.48, 0.42] },
    ], { macro: 0.55, macroScale: 0.004, detailNear: 300, detailFar: 2500, vertexColors: true, ...o }),
    // a dark sandstone cliff: an earthy grit texture side-projected reads as weathered rock; the
    // library's block-like rock26 read as a dressed stone wall on a 60 m heightfield face
    cliff: (o = {}) => terrainMaterial(ctx, [
      { id: 'pbr/acg_ground24', scale: 11, tint: [0.4, 0.33, 0.27], normalScale: 0.9 },
      { id: 'pbr/acg_ground13', scale: 8, tint: [0.42, 0.46, 0.34] },
      { id: 'pbr/acg_ground27', scale: 6, tint: [0.36, 0.32, 0.27] },
    ], { macro: 0.6, macroScale: 0.01, detailNear: 300, detailFar: 2500, vertexColors: true, ...o }),
    // farmed / grazed land seen from 150 m - 2 km: the photographic grass layers at a large tile with
    // weak normal maps (their tiled tread patterns read as chevrons on a slope at grazing angles),
    // a soil layer for ploughed strips, shingle at the shore; the field patchwork is vertex colour
    grass: (o = {}) => terrainMaterial(ctx, [
      { id: 'pbr/acg_rock26', scale: 9, tint: [0.4, 0.38, 0.35], normalScale: 0.5 },
      { id: 'pbr/acg_ground037', scale: 22, tint: [0.19, 0.26, 0.095], normalScale: 0.25 },
      { id: 'pbr/acg_ground24', scale: 18, tint: [0.3, 0.23, 0.15], normalScale: 0.3 },
      { id: 'pbr/acg_ground28', scale: 2.5, tint: [0.62, 0.58, 0.52], normalScale: 0.6 },
    ], { macro: 0.45, macroScale: 0.01, detailNear: 120, detailFar: 700, vertexColors: true, minRoughness: 0.88, ...o }),
    // seen from 2-3 km in mist: big tiles and weak normals (rock26's blocks at 6 m drew a fine
    // crosshatch over the whole face), bedding from the cliff shader instead
    pale: (o = {}) => terrainMaterial(ctx, [
      { id: 'pbr/acg_rock26', scale: 36, tint: [0.82, 0.8, 0.74], normalScale: 0.3 },
      { id: 'pbr/acg_ground13', scale: 20, tint: [0.46, 0.5, 0.36], normalScale: 0.25 },
      { id: 'pbr/acg_ground24', scale: 20, tint: [0.62, 0.6, 0.54], normalScale: 0.25 },
    ], { macro: 0.5, macroScale: 0.004, detailNear: 200, detailFar: 1400, vertexColors: true, ...o }),
  };
  const N = makeNoise(77);
  const land = async (o) => {
    const hf = heightfield({
      xs: gradedAxis(o.x[0], o.x[1], o.n[0], o.focus?.[0], o.focus ? 1.6 : 0), zs: gradedAxis(o.z[0], o.z[1], o.n[1], o.focus?.[1], o.focus ? 1.6 : 0),
      height: o.h,
      splat: o.splat || ((x, z, y, n) => { const steep = smooth(0.55, 0.85, 1 - n[1]); const low = 1 - smooth(1.5, 8, y); const g = (1 - steep) * (1 - low); return [Math.max(steep, low * 0.7), g * 0.7, g * 0.3 + low * 0.3, 0]; }),
      color: o.color || ((x, z, y, n) => { const p = N.fbm(x * 0.008 + 11, z * 0.008 - 4, 4); const v = Math.max(0.3, 0.95 + 0.9 * p); return [v * 0.98, v, v * 0.96]; }),
      skip: (a, b, c, d) => Math.max(a, b, c, d) < -10,
    });
    const m = new THREE.Mesh(hf.geometry, await terrainMats[o.mat || 'dark'](o.matOpts || {}));
    m.receiveShadow = true; m.castShadow = true;
    return { mesh: m, heightAt: o.h };
  };
  const locs = {};
  const group = (name) => { const g = new THREE.Group(); g.name = `loc:${name}`; g.visible = false; scene.add(g); locs[name] = g; return g; };

  // ---- farmed land: irregular fields (an anisotropic jittered-grid Voronoi, turned per landscape),
  // each with its own use, hedges along the boundaries, trees in the hedges and in small woods. Seen
  // from 150 m to 2 km a worked landscape reads by this patchwork; an even slope of one texture read
  // as CG (the provisional P-08 / P-11)
  const fields = fieldsVoronoi, USE = FIELD_USE;
  const hedgeMat = foliageMaterial({ color: [0.035, 0.055, 0.022], leafScale: 3, flower: [0.6, 0.6, 0.5, 0.12] });
  const hedgeGeo = [bushGeometry(1, 11, 0.8), bushGeometry(1, 23, 0.9)];
  /** hedges on the field boundaries (farmland.js hedgePlacements) as two instanced bush meshes */
  const hedges = (o) => {
    const h = hedgePlacements({ ...o, noise: (x, z) => N.fbm(x * 0.05 + 3, z * 0.05, 2) });
    const grp = new THREE.Group();
    h.bushes.forEach((list, i) => { if (list.length) grp.add(scatter(hedgeGeo[i], hedgeMat, list.length, (r, k) => list[k] || null, 3 + i)); });
    return { group: grp, trees: h.trees, count: h.count };
  };

  // ---- settlement: a fishing settlement on a slope above a shingle shore (P-08 / P-09): small hedged
  // fields round the houses, rough grazing above, moor on the tops; hawthorn and sycamore in the hedges
  if (used.has('settlement')) {
    const g = group('settlement');
    const shore = (x) => -140 + 35 * Math.sin(x / 210) + 18 * Math.sin(x / 63 + 1);
    const H = (x, z) => {
      const d = shore(x) - z;                       // metres inland (north of the shore)
      if (d < 0) return -6 + 6 * Math.exp(d / 40) - 0.02 * Math.max(0, -d);
      const slope = 0.06 * d + 0.00012 * d * d;
      return 0.5 + slope + 14 * N.fbm(x * 0.004 + 3, z * 0.004, 4) * smooth(20, 200, d) + 40 * smooth(300, 800, d) * (0.6 + 0.4 * N.fbm(x * 0.002, z * 0.002 + 5, 3));
    };
    const F = fields({ cell: 64, rot: 0.22, stretch: 1.7, seed: 3 });
    const LU = landUse(F, [0.5, 0.7, 0.9]);
    const moorAt = (x, z) => smooth(330, 520, shore(x) - z + 110 * N.fbm(x * 0.003 + 7, z * 0.003, 3));
    const color = (x, z, y, n) => {
      const d = shore(x) - z;
      const p = N.fbm(x * 0.02 + 11, z * 0.02 - 4, 3);
      let c = [1, 1, 1];
      if (d > 4) {
        const { k, f } = LU(x, z);
        const u = USE[k];
        const m = moorAt(x, z);
        const v = 0.9 + 0.2 * f.id;
        // the moor in patches: heather and dead bracken (darker, browner), paler grass between
        const hb = smooth(-0.15, 0.35, N.fbm(x * 0.007 + 2, z * 0.007 - 6, 3));
        const mo = [USE.moor[0] * (1.1 - 0.35 * hb), USE.moor[1] * (1.12 - 0.42 * hb), USE.moor[2] * (1.05 - 0.4 * hb)];
        c = [0, 1, 2].map((i) => (u[i] * v) * (1 - m) + mo[i] * (0.85 + 0.3 * p) * m);
        if (f.edge < 2.2 && m < 0.5) c = c.map((q) => q * 0.72);       // the hedge bottoms
      }
      return c.map((q) => q * (0.94 + 0.12 * p));
    };
    const splat = (x, z, y, n) => {
      const d = shore(x) - z;
      const steep = smooth(0.55, 0.85, 1 - n[1]);
      const shingle = 1 - smooth(1.5, 9, d) * smooth(0.4, 2.2, y);
      const { k } = LU(x, z);
      const m = moorAt(x, z);
      const soil = Math.max(k === 'plough' && m < 0.5 ? 1 : 0, 0.35 * m);
      const r = (1 - steep) * (1 - shingle);
      return [steep, r * (1 - soil), r * soil, shingle * (1 - steep)];
    };
    const L = await land({ x: [-1600, 1600], z: [-1500, 200], n: [520, 300], focus: [0, -180], h: H, mat: 'grass', color, splat });
    g.add(L.mesh);
    const M = await archMaterials(ctx);
    const kit = new Kit(0);
    const rr = mulberry(808);
    const spots = [];
    for (let k = 0; k < 44; k++) {
      const x = -300 + 600 * rr(), d = 22 + 170 * rr() * rr();
      const z = shore(x) - d;
      if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 14)) continue;
      spots.push([x, z]);
      const y = H(x, z);
      house(kit, yawFrame([x, y - 0.6, z], (rr() - 0.5) * 0.5), { w: 5.5 + 2 * rr(), d: 7 + 2 * rr(), storeys: rr() < 0.6 ? 0 : 1, allStone: rr() < 0.35, roof: rr() < 0.5 ? 'side' : 'front', cover: rr() < 0.5 ? 'slate' : 'clay', seed: 100 + k, lod: 'low', chimney: rr() < 0.6 });
    }
    const town = kit.build(M, { name: 'settlement' });
    town.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    g.add(town);
    // hedges: not on the shore, not across a house plot, not on the moor
    const hg = hedges({ x: [-560, 560], z: [-800, -110], F, H, seed: 41, treeP: 0.02,
      where: (x, z) => shore(x) - z > 12 && moorAt(x, z) < 0.45 && !spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 9) });
    g.add(hg.group);
    // trees: wind-shorn hawthorn and sycamore in the hedges, a few round the houses, small woods in the
    // folds of the slope
    const thorn = await treeKit(ctx, 'hawthorn', { variants: 2, seed: 51, exposure: 0.8 });
    const syc = await treeKit(ctx, 'sycamore', { variants: 2, seed: 52, exposure: 0.5 });
    const places = hg.trees.map(([x, y, z], i) => ({ kit: i % 3 ? thorn : syc, x, y: y - 0.2, z, variant: i % 2, yaw: rr() * 6.28, scale: 0.8 + 0.5 * rr() }));
    for (const [x, z] of spots) if (rr() < 0.45) { const a = rr() * 6.28; const tx = x + 9 * Math.cos(a), tz = z + 9 * Math.sin(a); places.push({ kit: syc, x: tx, y: H(tx, tz) - 0.2, z: tz, variant: Math.floor(rr() * 2), yaw: rr() * 6.28, scale: 0.8 + 0.4 * rr() }); }
    for (let z = -700; z < -150; z += 6) for (let x = -800; x < 800; x += 6) {
      const jx = x + (rr() - 0.5) * 5, jz = z + (rr() - 0.5) * 5;
      const d = shore(jx) - jz;
      if (d < 60 || moorAt(jx, jz) > 0.6 || N.fbm(jx * 0.006 + 21, jz * 0.006 - 3, 3) < 0.32) continue;
      if (spots.some((s) => Math.hypot(s[0] - jx, s[1] - jz) < 12)) continue;
      places.push({ kit: rr() < 0.7 ? syc : thorn, x: jx, y: H(jx, jz) - 0.2, z: jz, variant: Math.floor(rr() * 2), yaw: rr() * 6.28, scale: 0.75 + 0.5 * rr() });
    }
    g.add(scatterTrees(places, { views: [[-35, 13, 66], [25, 7, 310]], lod0: 40, lod1: 200, lod2: 700 }).group);
    console.warn(`[director] settlement: ${hg.count} hedge bushes, ${places.length} trees`);
  }
  // ---- forest: a dark sandstone sea cliff, oak and pine wood to its edge (P-10)
  if (used.has('forest')) {
    const g = group('forest');
    // the edge line wanders in headlands and bays (fine gullies every 20-40 m made an even comb of
    // vertical light / shadow stripes under the raking dawn sun: a timber palisade)
    const edge = (x) => -140 + 28 * Math.sin(x / 170 + 0.6) + 9 * Math.sin(x / 83 + 2) + 6 * N.fbm(x * 0.015, 3.3, 2);
    const topAt = (x) => 48 + 26 * smooth(-0.5, 0.6, N.fbm(x * 0.0016 + 4, 1.3, 3));      // 48-74 m along the coast
    const benchAt = (x) => 0.36 + 0.12 * N.fbm(x * 0.006 + 2, 5.5, 2);                  // the vegetated ledge
    const faceW = (x) => 22 + 8 * N.fbm(x * 0.02, 7, 2);
    // the profile down the face (u = 0 at the lip, 1 at the foot): an upper wall, a narrow bench where
    // a softer bed weathered back (scrub grows on it), a lower wall, a talus slope at the foot
    const prof = (u, b) => {
      if (u < b) return 1 - 0.47 * (u / b) - 0.015 * smooth(0, 0.05, u);
      if (u < b + 0.12) return 0.53 - 0.05 * (u - b) / 0.12;
      if (u < 0.86) return 0.48 - 0.42 * (u - b - 0.12) / (0.74 - b);
      return 0.06 * (1 - smooth(0.86, 1.25, u));
    };
    const H = (x, z) => {
      const d = edge(x) - z;                        // metres inland of the cliff edge
      const top = topAt(x) + 6 * N.fbm(x * 0.003, z * 0.003 + 9, 3) + 0.02 * Math.max(0, d);
      if (d > 0) return top + 1.5 * N.fbm(x * 0.03, z * 0.03, 3);
      const f = -d, w = faceW(x);
      const face = top * prof(f / w, benchAt(x)) + 3.5 * smooth(w * 0.85, w + 10, f) * (1 - smooth(w + 10, w + 34, f));
      return Math.max(-8, face - 0.25 * Math.max(0, f - w - 25));
    };
    // vertex colour on the face: horizontal beds (light / dark sandstone), dark run-off streaks, a
    // wet dark band at the foot; the texture alone repeats visibly on a 60 m face
    const faceColor = (x, z, y, n) => {
      const p = N.fbm(x * 0.008 + 11, z * 0.008 - 4, 4);
      let v = Math.max(0.3, 0.95 + 0.9 * p);
      const steep = smooth(0.35, 0.7, 1 - n[1]);
      if (steep > 0) {
        const bed = 0.5 + 0.5 * Math.sin(y * 0.42 + 2.5 * N.fbm(x * 0.012, 1.7, 2));
        const streak = N.fbm(x * 0.11, y * 0.015 + 2, 3);
        const wet = 1 - smooth(0.5, 5, y);
        // beds dominate; run-off streaks only here and there (an even comb of vertical streaks under a
        // raking sun read as a timber palisade)
        const patch = smooth(0.15, 0.55, N.fbm(x * 0.012 + 5, y * 0.01, 2));
        v *= 1 - steep * (0.42 - 0.45 * bed - 0.22 * streak * patch + 0.35 * wet);
      }
      return [v * 0.98, v * 0.97, v * 0.95];
    };
    const L = await land({ x: [-1400, 1400], z: [-1400, 400], n: [720, 480], focus: [0, -140], h: H, mat: 'cliff', color: faceColor, matOpts: { cliff: { strata: 1.0, streaks: 0.08, wet: 0.8, ochre: 0.6 } } });
    g.add(L.mesh);
    const oak = await treeKit(ctx, 'oak', { variants: 2, seed: 31, exposure: 0.2 });
    const oakW = await treeKit(ctx, 'oak', { variants: 2, seed: 32, exposure: 0.8, scale: 0.75 });
    const pine = await treeKit(ctx, 'pine', { variants: 2, seed: 33 });
    const rr = mulberry(4242), places = [];
    const G = 7.5;
    for (let z = -620; z < -100; z += G) for (let x = -1000; x < 560; x += G) {
      const jx = x + (rr() - 0.5) * G * 0.9, jz = z + (rr() - 0.5) * G * 0.9;
      const d = edge(jx) - jz;
      if (d < 1.5) continue;
      if (N.fbm(jx / 60 + 3, jz / 60, 3) < -0.35) continue;
      const u = rr();
      const kit = d < 18 ? (u < 0.7 ? oakW : pine) : u < 0.6 ? oak : pine;
      places.push({ kit, x: jx, y: H(jx, jz) - 0.2, z: jz, variant: Math.floor(rr() * 2), yaw: rr() * 6.28, scale: (0.8 + 0.4 * rr()) * (d < 18 ? 0.85 : 1) });
    }
    g.add(scatterTrees(places, { views: [[255, 20, 150]], lod0: 60, lod1: 250, lod2: 900 }).group);
    // scrub on the bench and the lip, fallen blocks along the foot (the face no longer meets the sea in
    // one smooth roll)
    const scrub = [], blocks = [];
    for (let x = -1000; x < 560; x += 2.2) {
      const w = faceW(x), b = benchAt(x), e = edge(x);
      if (N.fbm(x * 0.02 + 9, 2.2, 2) > -0.25) {
        const z = e + (b + 0.06) * w + (rr() - 0.5) * 2, y = H(x, z);
        const sc = 1.6 + 1.8 * rr();
        scrub.push({ p: [x + rr(), y - 0.3, z], s: [sc, sc * 0.7, sc], c: [0.8 + 0.4 * rr(), 0.9 + 0.2 * rr(), 0.8] });
      }
      if (rr() < 0.55) {
        const z = e + w * (0.9 + 0.35 * rr()), y = H(x, z);
        const sc = 1.2 + 4.5 * rr() * rr();
        blocks.push({ p: [x + rr() * 2, y - sc * 0.25, z], s: [sc, sc * (0.6 + 0.4 * rr()), sc * (0.8 + 0.4 * rr())], c: [0.85 + 0.3 * rr(), 0.85 + 0.25 * rr(), 0.8 + 0.25 * rr()] });
      }
    }
    g.add(scatter(hedgeGeo[0], hedgeMat, scrub.length, (r, k) => scrub[k] || null, 7));
    const rockMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.2, 0.16, 0.12), roughness: 0.92, metalness: 0 });
    g.add(scatter(rockGeometry(2, 5), rockMat, blocks.length, (r, k) => blocks[k] || null, 8));
  }
  // ---- walls: a curtain wall with round towers along a far ridge, inland (P-11)
  if (used.has('walls')) {
    const g = group('walls');
    const ridgeZ = (x) => -820 + 60 * Math.sin(x / 300);
    const H = (x, z) => {
      const r = Math.exp(-Math.pow((z - ridgeZ(x)) / 260, 2)) * (70 + 20 * N.fbm(x * 0.003, 4, 3));
      return 4 + r + 10 * N.fbm(x * 0.004 + 1, z * 0.004, 4) + 0.02 * Math.max(0, -z - 1000) + (z > -150 ? 6 * smooth(-150, 100, z) : 0);
    };
    // the land below the walls is farmed: long hedged strips on the lower slope, rough grazing on the
    // ridge (the wall keeps a clear glacis), small woods in the folds
    const F = fields({ cell: 95, rot: 0.12, stretch: 2.3, seed: 9 });
    const LU = landUse(F, [0.42, 0.66, 0.8]);
    const glacis = (x, z) => 1 - smooth(70, 150, z - ridgeZ(x) - 15);   // 1 within ~70 m below the wall (and beyond it)
    const color = (x, z, y, n) => {
      const p = N.fbm(x * 0.02 + 11, z * 0.02 - 4, 3);
      const { k, f } = LU(x, z);
      const gl = glacis(x, z);
      const u = USE[k], r = USE.rough, v = 0.9 + 0.2 * f.id;
      let c = [0, 1, 2].map((i) => u[i] * v * (1 - gl) + r[i] * 1.1 * gl);
      if (f.edge < 2.4 && gl < 0.5) c = c.map((q) => q * 0.72);
      return c.map((q) => q * (0.94 + 0.12 * p));
    };
    const splat = (x, z, y, n) => {
      const steep = smooth(0.55, 0.85, 1 - n[1]);
      const { k } = LU(x, z);
      const soil = k === 'plough' && glacis(x, z) < 0.5 ? 1 : 0;
      const r = 1 - steep;
      return [steep, r * (1 - soil), r * soil, 0];
    };
    const L = await land({ x: [-2600, 2600], z: [-2600, 300], n: [520, 360], focus: [0, -800], h: H, mat: 'grass', color, splat });
    g.add(L.mesh);
    const hg = hedges({ x: [-620, 620], z: [-780, -300], F, H, seed: 43, treeP: 0.018,
      where: (x, z) => glacis(x, z) < 0.4 });
    g.add(hg.group);
    const oak = await treeKit(ctx, 'oak', { variants: 2, seed: 61, exposure: 0.3 });
    const ash = await treeKit(ctx, 'ash', { variants: 2, seed: 62 });
    const rw = mulberry(4343);
    const places = hg.trees.map(([x, y, z], i) => ({ kit: i % 3 ? oak : ash, x, y: y - 0.2, z, variant: i % 2, yaw: rw() * 6.28, scale: 0.85 + 0.4 * rw() }));
    for (let z = -760; z < -60; z += 7) for (let x = -1000; x < 1000; x += 7) {
      const jx = x + (rw() - 0.5) * 6, jz = z + (rw() - 0.5) * 6;
      if (glacis(jx, jz) > 0.2 || N.fbm(jx * 0.005 + 31, jz * 0.005 - 9, 3) < 0.3) continue;
      places.push({ kit: rw() < 0.75 ? oak : ash, x: jx, y: H(jx, jz) - 0.2, z: jz, variant: Math.floor(rw() * 2), yaw: rw() * 6.28, scale: 0.8 + 0.45 * rw() });
    }
    g.add(scatterTrees(places, { views: [[66, 42, -281]], lod0: 40, lod1: 200, lod2: 700 }).group);
    console.warn(`[director] walls: ${hg.count} hedge bushes, ${places.length} trees`);
    const B = await buildingKit(ctx, { stoneTint: [0.62, 0.6, 0.56] });
    const crest = [];
    for (let x = -520; x <= 520; x += 8) crest.push([x, ridgeZ(x) + 15]);
    // the curtain wall follows the crest; towers every ~130 m, a gatehouse in the middle
    for (let i = 0; i + 1 < crest.length; i++) {
      const [x0, z0] = crest[i], [x1, z1] = crest[i + 1];
      const len = Math.hypot(x1 - x0, z1 - z0);
      const y0 = Math.min(H(x0, z0), H(x1, z1)) - 2;
      const seg = B.box(len + 0.4, 13 + Math.max(H(x0, z0), H(x1, z1)) - y0 - 1, 3.2, 0, 0, 0);
      seg.position.set((x0 + x1) / 2, y0 + seg.geometry.parameters.height / 2, (z0 + z1) / 2);
      seg.rotation.y = -Math.atan2(z1 - z0, x1 - x0);
      g.add(seg);
      // crenellations: merlons along the top
      if (i % 1 === 0) {
        const m = B.box(1.6, 1.4, 3.3, 0, 0, 0);
        m.position.set((x0 + x1) / 2, y0 + seg.geometry.parameters.height + 0.7, (z0 + z1) / 2);
        m.rotation.y = seg.rotation.y;
        g.add(m);
      }
    }
    for (const tx of [-520, -390, -260, -130, 0, 130, 260, 390, 520]) {
      const tz = ridgeZ(tx) + 15, ty = H(tx, tz) - 2;
      const tw = B.tower({ r: tx === 0 ? 7 : 5, h: tx === 0 ? 26 : 21, capH: 7, slits: 3 });
      tw.position.set(tx, ty, tz);
      g.add(tw);
    }
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  }
  // ---- verdor: a pale flat-topped limestone island alone on the sea, in mist (P-12)
  if (used.has('verdor')) {
    const g = group('verdor');
    const C = [200, -2500], R = [1700, 720];
    const H = (x, z) => {
      const dx = (x - C[0]) / R[0], dz = (z - C[1]) / R[1];
      const a = Math.atan2(dz, dx);
      const r = Math.hypot(dx, dz) * (1 + 0.14 * N.fbm(Math.cos(a) * 1.5 + 2, Math.sin(a) * 1.5, 4));
      if (r > 1.0) return -12 * smooth(1.0, 1.15, r) - 1;
      const cliff = smooth(0, 0.05, 1 - r);            // sheer pale cliffs all round
      const plateau = 95 + 55 * smooth(0.2, 0.9, 1 - r) + 18 * N.fbm(x * 0.002, z * 0.002, 3);
      return cliff * plateau + 3 * N.fbm(x * 0.02, z * 0.02, 3) * cliff;
    };
    const L = await land({ x: [C[0] - R[0] * 1.2, C[0] + R[0] * 1.2], z: [C[1] - R[1] * 1.3, C[1] + R[1] * 1.3], n: [900, 420], focus: [C[0], C[1] + R[1] * 0.95], h: H, mat: 'pale', matOpts: { cliff: { strata: 0.9, streaks: 0.25, wet: 0.5, ochre: 0.15 } } });
    // at 2.5 km under a 7 deg sun the shadow map (3 m texels) only adds acne: a crosshatch over the faces
    L.mesh.receiveShadow = false; L.mesh.castShadow = false;
    g.add(L.mesh);
  }
  // ---- islands: far, unreached islands on the horizon (P-15)
  if (used.has('islands')) {
    const g = group('islands');
    const isl = [[-5200, -9000, 900, 380, 240], [-1600, -12500, 1300, 520, 330], [1900, -8200, 700, 300, 170], [4600, -11000, 1600, 600, 410], [7400, -14000, 900, 380, 220]];
    await Promise.all(isl.map(async ([cx, cz, rx, rz, pk], k) => {
      const H = (x, z) => {
        const dx = (x - cx) / rx, dz = (z - cz) / rz;
        const r = Math.hypot(dx, dz) * (1 + 0.18 * N.fbm(dx * 1.3 + k * 3, dz * 1.3, 3));
        if (r > 1) return -6;
        return Math.pow(1 - r, 1.2) * pk * (0.7 + 0.3 * N.fbm(x * 0.003 + k, z * 0.003, 3)) + 15 * smooth(0, 0.06, 1 - r);
      };
      const L = await land({ x: [cx - rx * 1.2, cx + rx * 1.2], z: [cz - rz * 1.3, cz + rz * 1.3], n: [160, 90], h: H });
      L.mesh.castShadow = false; g.add(L.mesh);
    }));
  }
  // ---- sky: the wing-shaped cloud (a painted cloud card, as a matte painter would: fbm wisps inside
  // a spread-wing outline - leading-edge bone, finger streaks, scalloped trailing edge - lit from the
  // sun side, alpha-blended; it drifts across)
  let wing = null;
  if (used.has('sky')) {
    const g = group('sky');
    // a cloud is soft everywhere: the wing outline (wing-cloud.js) is only a density bias; fbm decides
    // where the vapour is, the edges dissolve into wisps, the finger bones read as denser streaks
    const cv = document.createElement('canvas'); cv.width = 768; cv.height = 384;
    const c2 = cv.getContext('2d');
    const img = c2.createImageData(cv.width, cv.height);
    paintWingCloud(img, (x, y) => N.fbm(x, y, 6), smooth);
    c2.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, color: new THREE.Color(1.18, 1.13, 1.06), fog: false });   // not clipped: the bone streaks must read
    wing = new THREE.Mesh(new THREE.PlaneGeometry(2100, 1050), mat);
    wing.renderOrder = 5;
    g.add(wing);
  }

  // ---- painted cloud decks (cloud-deck.js) for the locations whose look has `deck` (one or a list):
  // P-14's low stratocumulus - a painted underside (dark cores, pale thin edges, gaps) tiled on a
  // horizontal card at the cloud base, foreshortened by the lens toward the horizon; it writes depth so
  // the haze and fog take its own distance. `veil`: an opaque paler layer above it (gaps show overcast,
  // not clear sky). `paint`: options for paintCloudDeck (cover, cell sizes, shades)
  const paintTex = (n, fn) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = n;
    const c2 = cv.getContext('2d'), img = c2.createImageData(n, n);
    fn(img); c2.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; t.anisotropy = 8;
    return t;
  };
  const optional = [];
  for (const loc of used) {
    if (!LOOKS[loc]?.deck) continue;
    const g = locs[loc] || group(loc);
    for (const D of [].concat(LOOKS[loc].deck)) {
      const map = paintTex(draft ? 512 : 1024, (img) => paintCloudDeck(img, D.paint)); map.colorSpace = THREE.SRGBColorSpace;
      map.repeat.set(D.size / D.tile, D.size / D.tile);
      const detail = paintTex(256, (img) => paintCloudDetail(img, D.paint)); detail.repeat.set(D.size / D.detail, D.size / D.detail);
      // `glow` (a low sun lights the deck's sun side warm, the far side cool: vertex colour by the
      // heading from the location's home) and `edgeFade` (alpha to 0 over the outer fraction of the
      // card: a high deck's edge would show above the horizon) need a subdivided card
      const shaded = !!(D.glow || D.edgeFade);
      const deck = new THREE.Mesh(new THREE.PlaneGeometry(D.size, D.size, shaded ? 48 : 1, shaded ? 48 : 1),
        new THREE.MeshBasicMaterial({ map, alphaMap: detail, transparent: true, opacity: D.opacity ?? 1, depthWrite: true, side: THREE.DoubleSide, color: new THREE.Color(...D.color), fog: false, vertexColors: shaded }));
      deck.rotation.order = 'YXZ'; deck.rotation.set(Math.PI / 2, D.yaw * D2R, 0);
      deck.position.set(D.center[0], D.y, D.center[1]);
      deck.name = `cloudDeck:${loc}`;
      if (shaded) {
        deck.updateMatrixWorld(true);
        const P = deck.geometry.attributes.position, col = new Float32Array(P.count * 4), v = new THREE.Vector3();
        const G = D.glow, home = D.home || [0, 0], half = D.size / 2;
        for (let i = 0; i < P.count; i++) {
          const r = Math.max(Math.abs(P.getX(i)), Math.abs(P.getY(i))) / half;
          v.fromBufferAttribute(P, i).applyMatrix4(deck.matrixWorld);
          let c = [1, 1, 1];
          if (G) {
            const da = Math.cos(Math.atan2(v.x - home[0], -(v.z - home[1])) - G.az * D2R);
            const gs = Math.pow(Math.max(0, da), G.power ?? 2), ga = Math.max(0, -da);
            c = c.map((q, k) => 1 + (G.sun[k] - 1) * gs + (G.away[k] - 1) * ga);
          }
          col.set([c[0], c[1], c[2], D.edgeFade ? smooth(1, 1 - D.edgeFade, r) : 1], i * 4);
        }
        deck.geometry.setAttribute('color', new THREE.BufferAttribute(col, 4));
      }
      // `when`: shown only in the shots whose set names it (a deck added to a location after some of
      // its shots were final must not change those)
      if (D.when) { deck.userData.when = D.when; optional.push(deck); }
      g.add(deck);
      if (D.veil) {
        const veil = new THREE.Mesh(new THREE.PlaneGeometry(D.size * 1.5, D.size * 1.5), new THREE.MeshBasicMaterial({ color: new THREE.Color(...D.veil), side: THREE.DoubleSide, fog: false }));
        veil.rotation.x = Math.PI / 2; veil.position.set(D.center[0], D.y + 450, D.center[1]);
        g.add(veil);
      }
    }
  }

  const marks = { horizon: [0, 2, -6000], town: [0, 20, -230], cliff: [0, 50, -140], walls: [0, 60, -800], verdor: [200, 80, -2500], islands: [0, 120, -11000] };
  let curSea = null;
  return {
    marks, objects: { wing }, ground: () => 0,
    applyShot(info) {
      const st = info.spec.set || {}, t = info.local, c = info.cont;
      const loc = st.loc || 'calm';
      for (const [k, g] of Object.entries(locs)) g.visible = k === loc;
      for (const o of optional) o.visible = !!st[o.userData.when];
      const look = LOOKS[loc] || LOOKS.calm;
      // the sun of this shot (registry continuity), veiled or clear
      const sd = c.sun ? new THREE.Vector3(...c.sun).normalize() : sunVec(95, 7);
      sun.target.position.set(...(st.sunTarget || [0, 0, -600]));
      sun.position.copy(sun.target.position).addScaledVector(sd, 6000);
      const ext = st.shadowExtent || 2600;
      const sc = sun.shadow.camera; sc.left = -ext; sc.right = ext; sc.top = ext; sc.bottom = -ext; sc.near = 10; sc.far = 14000; sc.updateProjectionMatrix();
      // the sea
      const sea = st.sea ?? look.sea;
      for (const [k, o] of Object.entries(seas)) o.mesh.visible = k === sea;
      curSea = sea ? seas[sea] : null;
      if (curSea) curSea.update(info.t);
      // atmosphere and fog for this location
      const cc = ctx.cinematic;
      if (cc?.atmosphere) cc.atmosphere.haze = st.haze ?? look.haze;
      if (cc?.volumetrics) {
        cc.volumetrics.density = st.fog ?? look.density;
        cc.volumetrics.range = st.fogRange ?? look.range ?? 4000;
        cc.volumetrics.banks = look.banks(sd);
      }
      if (cc?.grade) cc.grade.whiteBalance = st.wb ?? look.wb;
      info.exposureTrim = look.exposure ?? 0;
      // the wing cloud drifts across (sky)
      if (wing && loc === 'sky') {
        const p = keyed(t, st.wing?.path || [[0, [-900, 1500, -3200]], [11, [700, 1650, -3300]]], { ease: 'linear' });
        wing.position.set(...p);
        wing.material.opacity = st.wing?.opacity ?? 0.85;
      }
    },
    afterCamera(info) { if (wing?.parent?.visible) wing.lookAt(info.ctx.camera.position); },
  };
}
