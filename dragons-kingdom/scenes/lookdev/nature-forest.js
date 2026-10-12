// Nature lookdev - "a forest reaching a cliff" (prologue montage, screenplay l.94). PROVISIONAL.
//
// The landscape montage of the prologue dissolves through "a coastal settlement, open sea, a forest
// reaching a cliff, distant fortified walls". This is the forest: a sessile-oak wood with ash and
// sycamore running out over the land to the very edge of a pale limestone sea cliff (the same rock
// as the Verdor coast, scenes/lib/nature/verdor-world.js, on its northern headland, z ~ 1700-2000),
// the trees at the edge sheared and stunted by the salt wind, hawthorn and blackthorn scrub along the
// lip, fallen blocks and surf at the foot. Seen from a boat offshore.
//   t = 1  from the sea, 420 m out, 18 m up, 35 mm
//   t = 2  closer along the cliff, 50 mm: the wood's edge where it meets the face
//
//   node render/render.mjs --still scenes/lookdev/nature-forest.js --time 1 --preset final --png out.png
import * as THREE from 'three';
import { createOcean } from 'dk/ocean.js';
import { loadHDRI } from '../lib/assets.js';
import { loadVerdorCoast, verdorWorld } from '../lib/nature/coast.js';
import { scatterCoastRocks } from '../lib/nature/rocks.js';
import { treeKit, scatterTrees } from '../lib/nature/trees.js';
import { mulberry, smoothstep } from '../lib/nature/noise.js';
import { filmFinish } from './finish.js';

// the same photographed sky and sun as the coast lookdev (continuity)
const SUN_H = new THREE.Vector3(0.6, 0, -0.8).normalize();
const KLOOF_AZ0 = 0.942;
const HDRI_ROT = Math.atan2(SUN_H.x, SUN_H.z) - KLOOF_AZ0;

export const meta = {
  title: 'Nature lookdev - a forest reaching a cliff',
  duration: 3,
  seed: 17,
  cinematic: filmFinish({
    atmosphere: { enabled: true, sky: 'scene', haze: 1.7, apDistanceScale: 1.2 },
    volumetrics: { enabled: false },
    shadows: { cascades: 3, maxDistance: 1400, split: 0.8 },
    ao: { enabled: true, radius: 2.0 },
    dof: { samples: 24 },
    grade: { exposure: 1.9, whiteBalance: 6000, contrast: 1.12, saturation: 0.95 },
  }),
};

let S;
const Z0 = 1700;

export async function setup(ctx) {
  const { scene, camera } = ctx;
  const W = await verdorWorld();
  const xc = (z) => W.xc(z);
  const SH = [null,
    { pos: [xc(Z0) + 420, 18, Z0 - 60], look: [xc(Z0 + 60) - 70, 52, Z0 + 60], f: 35 },
    { pos: [xc(Z0 + 120) + 160, 9, Z0 + 20], look: [xc(Z0 + 200) - 10, 50, Z0 + 230], f: 50 },
  ];
  const sky = await loadHDRI('hdri/kloofendal_48d_partly_cloudy', ctx, { extractSun: true, rotationY: HDRI_ROT, horizonFill: { above: 3.5, below: -1.5, blend: 1.5 } });
  const sun = sky.apply(scene);
  sun.intensity *= 1.45;
  scene.environmentIntensity = 0.9;
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  scene.add(sun, sun.target);
  const views = SH.filter(Boolean).map((s) => s.pos);
  const coast = await loadVerdorCoast(ctx, { views, radius: 4000 });
  scene.add(coast.group);
  scene.add((await scatterCoastRocks(ctx, coast, { views })).group);
  // the wood: oak with ash and sycamore, from the cliff lip ~450 m inland along ~900 m of coast;
  // at the edge the trees are wind-shorn and low, hawthorn and blackthorn in the lip scrub
  const inland = (x, z) => W.footF(x, z) + 2 - W.coastF(x, z);
  const oak = await treeKit(ctx, 'oak', { variants: 3, seed: 21, exposure: 0.15 });
  const oakW = await treeKit(ctx, 'oak', { variants: 2, seed: 22, exposure: 0.8, scale: 0.7 });
  const ash = await treeKit(ctx, 'ash', { variants: 2, seed: 23 });
  const syc = await treeKit(ctx, 'sycamore', { variants: 2, seed: 24 });
  const thorn = await treeKit(ctx, 'hawthorn', { variants: 3, seed: 25, exposure: 0.9 });
  const sloe = await treeKit(ctx, 'blackthorn', { variants: 2, seed: 26, exposure: 0.6 });
  const rr = mulberry(1777), places = [];
  const G = 6.2;
  for (let z = Z0 - 380; z < Z0 + 290; z += G) for (let x = xc(z) - 470; x < xc(z) + 30; x += G) {
    const jx = x + (rr() - 0.5) * G * 0.9, jz = z + (rr() - 0.5) * G * 0.9;
    const e = inland(jx, jz);
    if (e < 1 || e > 460) continue;
    // the wood's inland edge is ragged; glades here and there
    if (e > 330 + 120 * rr()) continue;
    if (W.N.fbm2(jx / 70 + 3, jz / 70, 3) < -0.32) continue;
    const y = coast.surfaceAt(jx, jz);
    if (!(y > 6)) continue;
    const gx = coast.surfaceAt(jx + 1.5, jz) - coast.surfaceAt(jx - 1.5, jz), gz = coast.surfaceAt(jx, jz + 1.5) - coast.surfaceAt(jx, jz - 1.5);
    const sl = Math.hypot(gx, gz) / 3;
    if (sl > 1.4) continue;                                      // not on the face
    const edge = 1 - smoothstep(6, 40, e);                       // the salt-pruned fringe
    const u = rr();
    let kit, scale;
    // the steep turfed head above the face: thorn scrub and stunted oak hanging over the edge (the
    // wood has to be seen to reach the cliff from a boat below, not stop at the top of the head)
    if (sl > 0.8) { kit = u < 0.4 ? thorn : u < 0.7 ? sloe : oakW; scale = 0.75 + 0.35 * rr(); }
    else if (edge > 0.6) { kit = u < 0.35 ? thorn : u < 0.6 ? sloe : oakW; scale = 0.8 + 0.4 * rr(); }
    else if (edge > 0.15) { kit = u < 0.6 ? oakW : u < 0.8 ? thorn : oak; scale = 0.75 + 0.35 * rr(); }
    else { kit = u < 0.68 ? oak : u < 0.86 ? ash : syc; scale = (0.8 + 0.45 * rr()) * (0.85 + 0.15 * smoothstep(40, 160, e)); }
    places.push({ kit, x: jx, y, z: jz, variant: Math.floor(rr() * 3), yaw: (rr() - 0.5) * (edge > 0.15 ? 0.5 : 6.28), scale });
  }
  scene.add(scatterTrees(places, { views, lod0: 70, lod1: 260, lod2: 1100 }).group);
  console.warn(`[nature] forest: ${places.length} trees`);
  const ocean = createOcean(ctx, { windSpeed: 7, windDirection: 190, swell: 0.55, choppiness: 1.2, seed: 9, depth: 30, mipFilter: 'trilinear', roughness: 0.05, foamThreshold: 0.7, shoreFoam: 1.0, shoreFoamWidth: 1.6, surf: 0.85 });
  ocean.mesh.position.y = -1.1;
  scene.add(ocean.mesh);
  camera.near = 0.3; camera.far = 30000;
  S = { sun, SUN: sky.sun.direction.clone(), ocean, SH };
}

export function update(t, ctx) {
  const { sun, SUN, ocean, SH } = S;
  ocean.update(t);
  // shots switch a quarter second before each whole second (a still at t = N shows shot N alone)
  const i = Math.min(SH.length - 1, Math.max(1, Math.floor(t + 0.25)));
  const s = SH[i];
  const cam = ctx.camera;
  cam.position.set(...s.pos);
  cam.lookAt(...s.look);
  cam.updateMatrixWorld(true);
  const tgt = new THREE.Vector3(...s.look);
  sun.target.position.copy(tgt);
  sun.position.copy(tgt).addScaledVector(SUN, 900);
  ctx.lens.sensor = 'super35';
  ctx.lens.focalLength = s.f;
  ctx.lens.fstop = 8;
  ctx.lens.focus = cam.position.distanceTo(tgt);
  ctx.lens.shutterAngle = 180;
  ctx.lens.iso = 200;
}
