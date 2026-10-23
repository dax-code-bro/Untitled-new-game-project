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
import { Kit, yawFrame, frame } from '../../architecture/core.js';
import { archMaterials } from '../../architecture/materials.js';
import { house } from '../../architecture/house.js';
import { treeKit, scatterTrees } from '../../nature/trees.js';
import { mulberry } from '../../nature/noise.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { keyed, clamp } from '../timeline.js';
import { paintWingCloud } from './wing-cloud.js';

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
  settlement: { sea: 'dawn', haze: 4.5, density: 0.00022, wb: 4500, exposure: 1.5, banks: (S) => [
    { center: [S.x * 3000, S.y * 3000 + 60, S.z * 3000], radius: [1800, 360, 600], density: 0.02, noise: 0.95 },
    { center: [200, 70, -900], radius: [1200, 45, 300], density: 0.004, noise: 0.95 },
    { center: [-500, 6, 400], radius: [900, 10, 200], density: 0.002, noise: 0.95 }] },
  forest: { sea: 'dawn', haze: 4.0, density: 0.0002, wb: 4600, exposure: 1.4, banks: (S) => [
    { center: [S.x * 3000, S.y * 3000 + 60, S.z * 3000], radius: [1800, 360, 600], density: 0.02, noise: 0.95 },
    { center: [-400, 5, 300], radius: [800, 9, 160], density: 0.002, noise: 0.95 }] },
  walls: { sea: null, haze: 4.5, density: 0.00025, wb: 4700, exposure: 1.6, banks: () => [
    { center: [-300, 30, -450], radius: [900, 25, 200], density: 0.002, noise: 0.95 }] },
  verdor: { sea: 'dawn', haze: 4.0, density: 0.00015, wb: 4800, exposure: 1.4, banks: () => [
    { center: [-200, 30, -1900], radius: [2200, 35, 300], density: 0.006, noise: 0.9 }] },
  calm: { sea: 'calm', haze: 1.2, density: 0.00004, wb: 6000, exposure: 2.1, banks: () => [] },
  swell: { sea: 'swell', haze: 3.4, density: 0.00018, wb: 5000, exposure: -0.2, range: 16000, banks: () => [
    { center: [0, 620, 0], radius: [30000, 140, 30000], density: 0.01, noise: 0.8 }] },
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
      { id: 'pbr/acg_ground24', scale: 11, tint: [0.4, 0.33, 0.27], normalScale: 1.6 },
      { id: 'pbr/acg_ground13', scale: 8, tint: [0.42, 0.46, 0.34] },
      { id: 'pbr/acg_ground27', scale: 6, tint: [0.36, 0.32, 0.27] },
    ], { macro: 0.6, macroScale: 0.01, detailNear: 300, detailFar: 2500, vertexColors: true, ...o }),
    pale: (o = {}) => terrainMaterial(ctx, [
      { id: 'pbr/acg_rock26', scale: 6, tint: [0.82, 0.8, 0.74] },
      { id: 'pbr/acg_ground13', scale: 8, tint: [0.46, 0.5, 0.36] },
      { id: 'pbr/acg_ground24', scale: 8, tint: [0.62, 0.6, 0.54] },
    ], { macro: 0.5, macroScale: 0.004, detailNear: 300, detailFar: 3000, vertexColors: true, ...o }),
  };
  const N = makeNoise(77);
  const land = async (o) => {
    const hf = heightfield({
      xs: gradedAxis(o.x[0], o.x[1], o.n[0], o.focus?.[0], o.focus ? 1.6 : 0), zs: gradedAxis(o.z[0], o.z[1], o.n[1], o.focus?.[1], o.focus ? 1.6 : 0),
      height: o.h,
      splat: (x, z, y, n) => { const steep = smooth(0.55, 0.85, 1 - n[1]); const low = 1 - smooth(1.5, 8, y); const g = (1 - steep) * (1 - low); return [Math.max(steep, low * 0.7), g * 0.7, g * 0.3 + low * 0.3, 0]; },
      color: o.color || ((x, z, y, n) => { const p = N.fbm(x * 0.008 + 11, z * 0.008 - 4, 4); const v = Math.max(0.3, 0.95 + 0.9 * p); return [v * 0.98, v, v * 0.96]; }),
      skip: (a, b, c, d) => Math.max(a, b, c, d) < -10,
    });
    const m = new THREE.Mesh(hf.geometry, await terrainMats[o.mat || 'dark'](o.matOpts || {}));
    m.receiveShadow = true; m.castShadow = true;
    return { mesh: m, heightAt: o.h };
  };
  const locs = {};
  const group = (name) => { const g = new THREE.Group(); g.name = `loc:${name}`; g.visible = false; scene.add(g); locs[name] = g; return g; };

  // ---- settlement: a fishing settlement on a slope above a shingle shore (P-08 / P-09)
  if (used.has('settlement')) {
    const g = group('settlement');
    const shore = (x) => -140 + 35 * Math.sin(x / 210) + 18 * Math.sin(x / 63 + 1);
    const H = (x, z) => {
      const d = shore(x) - z;                       // metres inland (north of the shore)
      if (d < 0) return -6 + 6 * Math.exp(d / 40) - 0.02 * Math.max(0, -d);
      const slope = 0.06 * d + 0.00012 * d * d;
      return 0.5 + slope + 14 * N.fbm(x * 0.004 + 3, z * 0.004, 4) * smooth(20, 200, d) + 40 * smooth(300, 800, d) * (0.6 + 0.4 * N.fbm(x * 0.002, z * 0.002 + 5, 3));
    };
    const L = await land({ x: [-1600, 1600], z: [-1500, 200], n: [520, 300], focus: [0, -180], h: H });
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
  }
  // ---- forest: a dark sandstone sea cliff, oak and pine wood to its edge (P-10)
  if (used.has('forest')) {
    const g = group('forest');
    // the edge line wanders, with gullies and buttresses (vertical shadow lines on the face)
    const edge = (x) => -140 + 28 * Math.sin(x / 170 + 0.6) + 12 * Math.sin(x / 47) + 9 * N.fbm(x * 0.045, 3.3, 3) + 4 * N.fbm(x * 0.17, 8.1, 2);
    const H = (x, z) => {
      const d = edge(x) - z;                        // metres inland of the cliff edge
      const top = 62 + 10 * N.fbm(x * 0.003, z * 0.003 + 9, 3) + 0.02 * Math.max(0, d);
      if (d > 0) return top + 1.5 * N.fbm(x * 0.03, z * 0.03, 3);
      // the face: near-vertical, with ledges; a boulder apron at its foot
      const f = -d;
      // a stepped face: two hard beds make ledges, softer beds between weather back; talus at the foot
      const w = 16 + 8 * N.fbm(x * 0.02, 7, 2);
      const u = smooth(0, w, f);
      const steps = 0.08 * Math.sin(u * Math.PI * 3) * (1 - u);
      const face = top * (1 - u - steps) + 3.5 * smooth(w * 0.7, w + 14, f) * (1 - smooth(w + 14, w + 40, f));
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
        v *= 1 - steep * (0.45 - 0.35 * bed - 0.4 * streak + 0.35 * wet);
      }
      return [v * 0.98, v * 0.97, v * 0.95];
    };
    const L = await land({ x: [-1400, 1400], z: [-1400, 400], n: [720, 480], focus: [0, -140], h: H, mat: 'cliff', color: faceColor, matOpts: { cliff: { strata: 1.0, streaks: 0.9, wet: 0.8, ochre: 0.6 } } });
    g.add(L.mesh);
    const oak = await treeKit(ctx, 'oak', { variants: 2, seed: 31, exposure: 0.2 });
    const oakW = await treeKit(ctx, 'oak', { variants: 2, seed: 32, exposure: 0.8, scale: 0.75 });
    const pine = await treeKit(ctx, 'pine', { variants: 2, seed: 33 });
    const rr = mulberry(4242), places = [];
    const G = 7.5;
    for (let z = -620; z < -100; z += G) for (let x = -420; x < 420; x += G) {
      const jx = x + (rr() - 0.5) * G * 0.9, jz = z + (rr() - 0.5) * G * 0.9;
      const d = edge(jx) - jz;
      if (d < 1.5) continue;
      if (N.fbm(jx / 60 + 3, jz / 60, 3) < -0.35) continue;
      const u = rr();
      const kit = d < 18 ? (u < 0.7 ? oakW : pine) : u < 0.6 ? oak : pine;
      places.push({ kit, x: jx, y: H(jx, jz) - 0.2, z: jz, variant: Math.floor(rr() * 2), yaw: rr() * 6.28, scale: (0.8 + 0.4 * rr()) * (d < 18 ? 0.85 : 1) });
    }
    g.add(scatterTrees(places, { views: [[0, 12, 420]], lod0: 60, lod1: 250, lod2: 900 }).group);
  }
  // ---- walls: a curtain wall with round towers along a far ridge, inland (P-11)
  if (used.has('walls')) {
    const g = group('walls');
    const ridgeZ = (x) => -820 + 60 * Math.sin(x / 300);
    const H = (x, z) => {
      const r = Math.exp(-Math.pow((z - ridgeZ(x)) / 260, 2)) * (70 + 20 * N.fbm(x * 0.003, 4, 3));
      return 4 + r + 10 * N.fbm(x * 0.004 + 1, z * 0.004, 4) + 0.02 * Math.max(0, -z - 1000) + (z > -150 ? 6 * smooth(-150, 100, z) : 0);
    };
    const L = await land({ x: [-2600, 2600], z: [-2600, 300], n: [520, 360], focus: [0, -800], h: H });
    g.add(L.mesh);
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
      const cliff = smooth(0, 0.035, 1 - r);           // sheer pale cliffs all round
      const plateau = 95 + 55 * smooth(0.2, 0.9, 1 - r) + 18 * N.fbm(x * 0.002, z * 0.002, 3);
      return cliff * plateau + 3 * N.fbm(x * 0.02, z * 0.02, 3) * cliff;
    };
    const L = await land({ x: [C[0] - R[0] * 1.2, C[0] + R[0] * 1.2], z: [C[1] - R[1] * 1.3, C[1] + R[1] * 1.3], n: [420, 220], h: H, mat: 'pale' });
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

  const marks = { horizon: [0, 2, -6000], town: [0, 20, -230], cliff: [0, 50, -140], walls: [0, 60, -800], verdor: [200, 80, -2500], islands: [0, 120, -11000] };
  let curSea = null;
  return {
    marks, objects: { wing }, ground: () => 0,
    applyShot(info) {
      const st = info.spec.set || {}, t = info.local, c = info.cont;
      const loc = st.loc || 'calm';
      for (const [k, g] of Object.entries(locs)) g.visible = k === loc;
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
