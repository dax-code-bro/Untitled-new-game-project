// Shot director set - BIRTHING_CHAMBER (Verdor palace, interior): TITLE and scene 1A.
//
// Built from the architecture library's chamber (scenes/lib/architecture/interiors.js
// birthingChamber: washed rubble walls, joisted ceiling, the high east window, lamp niches, the
// plank-framed straw nest with its cloth-simulated linen), the props library's egg (closed with an
// old fracture / cracked / opened), the creatures library's gold hatchling and the humans cast.
// The look follows style frame F4 (scenes/lookdev/style-f4-birthing-chamber.js): warm low lamps
// and a cool daylight shaft from the high window made visible by dust in the air.
//
// CHAMBER MAP (VERDOR frame: +x east, -z north; the chamber's floor centre at the origin; this is
// the map every 1A shot keeps - shotlist.json conventions.birthing_chamber_map):
//   nest      centre (-0.6, 0, 0.3), 2.5 x 2.0 m frame, bed ~0.45 m; linen over its east half
//   egg       on the linen at EGG (0.62, bed, -0.18), standing on its blunt end; the hatchling breaks
//             out of the narrow top and comes to rest on the linen heading west-south-west (F4)
//   window    high in the EAST wall (x = 3.6, z -0.9..0.2, y 3.15..4.75): the sun shaft (F4 sun)
//   door      WEST wall, north end (x = -3.6, z -1.2..-2.6): the master camera (south of the nest,
//             looking north-west) sees it at LEFT BACKGROUND
//   Alexandria  EAST of the nest (screen RIGHT): the stool / kneeling at the nest's east board
//   attendant   WEST of the nest (screen LEFT); Abby crouches SOUTH-WEST (front-left); Remi behind her
// The shot list's map ("Nest in the center, Alexandria on screen RIGHT of the nest, attendant on
// LEFT, door at LEFT background. Abby crouches front-left") holds for every camera on the south
// side of the nest; the reverse shots toward the door (1A-18, 1A-32, X2-02) are declared as such.
import * as THREE from 'three';
import { Kit, frame, sub, makeRand } from '../../architecture/core.js';
import { archMaterials } from '../../architecture/materials.js';
import { birthingChamber, loadArchCache, NEST } from '../../architecture/interiors.js';
import { door as doorBuilder } from '../../architecture/openings.js';
import { verdorKit } from '../../props/verdor.js';
import { stool as propStool } from '../../props/containers.js';
import { Kit as PropKit, frame as pframe, rng as prng } from '../../props/core.js';
import { filmFinish } from '../../../lookdev/finish.js';
import { keyed, clamp, ease, vnoise1, smoothstep } from '../timeline.js';

export const NEST_C = [-0.6, 0, 0.3];
export const EGG = [0.62, 0, -0.18];
const ROOM = { w: 7.2, d: 6.2, h: 5.6, T: 0.9 };
const DOOR = { wall: 'west', x: 4.3, w: 1.4, h: 2.7 };          // birthingChamber door option (along the west wall from its south end)
// door opening in world coordinates (west wall frame: origin (-3.6, 0, 3.1), X = (0, 0, -1))
const DOOR_Z0 = ROOM.d / 2 - DOOR.x, DOOR_Z1 = DOOR_Z0 - DOOR.w;   // -1.2 .. -2.6
const DOOR_C = [-ROOM.w / 2, 0, (DOOR_Z0 + DOOR_Z1) / 2];

/** The cinematic look (F4's, with fewer DOF taps for running footage). */
export function cinematic() {
  return filmFinish({
    volumetrics: {
      enabled: true, range: 14, near: 0.05, resolution: [160, 90, 48], noiseFilter: true,
      density: 0.12, heightFalloff: 0.0, fogBase: 0, anisotropy: 0.2, noiseScale: 0.9, noiseAmount: 0.55, wind: [0.03, 0.01, 0.0], shadowSoftness: 0.05,
      ambient: [0.0003, 0.00025, 0.0002], intensity: 1.0,
    },
    shadows: { cascades: 0 },
    ao: { enabled: true, radius: 0.12, maxRadiusPx: 0.03, contactShadows: true, contactLength: 0.03, contactMaxDistance: 4 },
    dof: { samples: 48, maxCoC: 0.022 },
    grade: { exposure: 1.3, whiteBalance: 4700, contrast: 1.05, saturation: 1.0 },
    grain: { amount: 3.4 },
    lensFx: { vignette: 0.85 },
  });
}

/** Remove the triangles of the given material meshes whose centroid lies in a world box. */
function cutBox(group, names, box) {
  let removed = 0;
  group.traverse((m) => {
    if (!m.isMesh || !names.some((n) => m.name.endsWith(':' + n))) return;
    const g = m.geometry, P = g.attributes.position.array, I = g.index.array;
    const o = m.position;
    const keep = [];
    for (let i = 0; i < I.length; i += 3) {
      let cx = 0, cy = 0, cz = 0;
      for (let k = 0; k < 3; k++) { const j = I[i + k] * 3; cx += P[j]; cy += P[j + 1]; cz += P[j + 2]; }
      cx = cx / 3 + o.x; cy = cy / 3 + o.y; cz = cz / 3 + o.z;
      if (cx > box[0][0] && cx < box[1][0] && cy > box[0][1] && cy < box[1][1] && cz > box[0][2] && cz < box[1][2]) { removed++; continue; }
      keep.push(I[i], I[i + 1], I[i + 2]);
    }
    g.setIndex(new THREE.BufferAttribute(I.length > 65535 * 3 || g.attributes.position.count > 65535 ? new Uint32Array(keep) : new Uint16Array(keep), 1));
  });
  return removed;
}

/** linen surface height (nest-local bake rasterised into a 1 cm grid; F4's method) */
function makeLinenY(cloth) {
  if (!cloth) return (x, z) => NEST.TOP + 0.13;
  const { nx, ny, positions: P } = cloth;
  const V = (i, j) => { const k = (j * (nx + 1) + i) * 3; return [P[k], P[k + 1], P[k + 2]]; };
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let k = 0; k < P.length; k += 3) { x0 = Math.min(x0, P[k]); x1 = Math.max(x1, P[k]); z0 = Math.min(z0, P[k + 2]); z1 = Math.max(z1, P[k + 2]); }
  const C = 0.01, GX = Math.ceil((x1 - x0) / C) + 2, GZ = Math.ceil((z1 - z0) / C) + 2;
  const G = new Float32Array(GX * GZ).fill(-1e9);
  const tri = (a, b, c) => {
    const ia = Math.max(0, Math.floor((Math.min(a[0], b[0], c[0]) - x0) / C)), ib = Math.min(GX - 1, Math.ceil((Math.max(a[0], b[0], c[0]) - x0) / C));
    const ja = Math.max(0, Math.floor((Math.min(a[2], b[2], c[2]) - z0) / C)), jb = Math.min(GZ - 1, Math.ceil((Math.max(a[2], b[2], c[2]) - z0) / C));
    const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2]);
    if (Math.abs(det) < 1e-12) return;
    for (let j = ja; j <= jb; j++) for (let i = ia; i <= ib; i++) {
      const x = x0 + i * C, z = z0 + j * C;
      const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det, l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det, l3 = 1 - l1 - l2;
      if (l1 < -0.02 || l2 < -0.02 || l3 < -0.02) continue;
      G[j * GX + i] = Math.max(G[j * GX + i], l1 * a[1] + l2 * b[1] + l3 * c[1]);
    }
  };
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) { const a = V(i, j), b = V(i + 1, j), c = V(i, j + 1), d = V(i + 1, j + 1); tri(a, b, d); tri(a, d, c); }
  for (let pass = 0; pass < 40; pass++) for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) {
    if (G[j * GX + i] > -1e8) continue;
    let m = -1e9; for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const ii = i + di, jj = j + dj; if (ii >= 0 && jj >= 0 && ii < GX && jj < GZ) m = Math.max(m, G[jj * GX + ii]); }
    if (m > -1e8) G[j * GX + i] = m;
  }
  const at = (i, j) => { const v = G[Math.min(GZ - 1, Math.max(0, j)) * GX + Math.min(GX - 1, Math.max(0, i))]; return v > -1e8 ? v : NEST.TOP + 0.09; };
  return (x, z) => {
    const u = (x - NEST_C[0] - x0) / C, v = (z - NEST_C[2] - z0) / C;
    const i = Math.floor(u), j = Math.floor(v), fu = u - i, fv = v - j;
    return (at(i, j) * (1 - fu) + at(i + 1, j) * fu) * (1 - fv) + (at(i, j + 1) * (1 - fu) + at(i + 1, j + 1) * fu) * fv + 0.004;
  };
}

/** A thin dark crack line on the egg surface whose length grows with progress 0..1. */
function crackLine(points, mat) {
  const N = points.length;
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 2 * 3);
  const idx = [];
  for (let i = 0; i < N; i++) {
    const p = points[i].p, s = points[i].side;
    const w = points[i].w;
    pos.set([p.x + s.x * w, p.y + s.y * w, p.z + s.z * w], i * 6);
    pos.set([p.x - s.x * w, p.y - s.y * w, p.z - s.z * w], i * 6 + 3);
    if (i < N - 1) { const a = i * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, c, b, b, c, d); }
  }
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const m = new THREE.Mesh(g, mat);
  m.userData.nTri = idx.length;
  m.castShadow = false;
  return m;
}

export async function build(ctx, { shotSpecs }) {
  const { scene, renderer } = ctx;
  const draft = ctx.preset === 'draft' || ctx.preset === 'preview';
  const rnd = makeRand(919);
  // reflections: a small environment scene of THIS room (gold mirrors its surroundings; F4)
  {
    const es = new THREE.Scene();
    es.add(new THREE.Mesh(new THREE.BoxGeometry(7.2, 5.6, 6.2), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.032, 0.018), side: THREE.BackSide })).translateY(2.6));
    const add = (geo, col, x, y, z) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: new THREE.Color(...col), side: THREE.DoubleSide })); m.position.set(x, y, z); m.lookAt(0.3, 0.5, 0.1); es.add(m); };
    add(new THREE.PlaneGeometry(1.8, 1.2), [0.5, 0.3, 0.15], -1.2, 1.0, -2.9);
    add(new THREE.SphereGeometry(0.05, 12, 8), [40, 18, 5], -0.55, 0.55, -0.45);
    add(new THREE.SphereGeometry(0.04, 12, 8), [25, 11, 3], -1.0, 0.65, -2.6);
    add(new THREE.PlaneGeometry(1.1, 1.6), [1.6, 1.8, 2.1], 3.5, 3.95, -0.35);
    add(new THREE.PlaneGeometry(1.2, 1.2), [0.24, 0.19, 0.13], 0.3, 0.0, 0.1);
    const pm = new THREE.PMREMGenerator(renderer);
    scene.environment = pm.fromScene(es, 0, 0.05, 30).texture;
    pm.dispose();
    scene.environmentIntensity = 0.4;
  }
  scene.background = new THREE.Color(0, 0, 0);

  // the sun through the high east window (direction per shot from the registry's continuity)
  const sun = new THREE.DirectionalLight(new THREE.Color(0.86, 0.92, 1.0), 2.3);
  sun.castShadow = true;
  const sm = draft ? 2048 : 4096;
  sun.shadow.mapSize.set(sm, sm);
  const sc = sun.shadow.camera; sc.left = -4.5; sc.right = 4.5; sc.top = 4.5; sc.bottom = -4.5; sc.near = 5; sc.far = 40;
  sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.012;
  sun.target.position.set(0, 0, 0.1);
  scene.add(sun, sun.target);

  // ---- the chamber
  const M = await archMaterials(ctx);
  const kit = new Kit(0);
  const cloth = await loadArchCache('nest_cloth');
  const ch = birthingChamber(kit, frame([0, 0, 0]), { seed: 3, cloth, nest: NEST_C, door: { ...DOOR, open: 0 }, lod: draft ? 'mid' : 'mid' });
  const room = kit.build(M, { name: 'chamber' });
  // the architecture's door leaf is merged into the room's oak and iron: cut it out and hang our own
  // leaf on a hinge so it can open and close (1A-03, 1A-18, 1A-32, X2-02)
  const leafBox = [[-ROOM.w / 2 - 0.62, 0.0, DOOR_Z1 - 0.05], [-ROOM.w / 2 - 0.42, DOOR.h + 0.05, DOOR_Z0 + 0.05]];
  cutBox(room, ['oak', 'oakDark', 'iron'], leafBox);
  scene.add(room);
  const lamps = [];
  for (const l of ch.lights) { l.intensity *= 0.6; l.userData.dirScale = 1; scene.add(l); lamps.push(l); }
  const lampBase = lamps.map((l) => l.intensity);
  // our own door leaf (built with the architecture door() into its own kit, hinged at the north jamb)
  const wallF = frame([-ROOM.w / 2, 0, ROOM.d / 2], [0, 0, -1], [0, 1, 0]);
  const dk = new Kit(0);
  doorBuilder(dk, sub(wallF, [DOOR.x, 0, 0]), { w: DOOR.w, h: DOOR.h, arch: true, inset: ROOM.T * 0.6, open: 0, hingeLeft: false, room: false, wallT: ROOM.T, seed: 77 });
  const leaf = dk.build(M, { name: 'door-leaf', origin: [0, 0, 0] });
  const hinge = new THREE.Group();
  hinge.position.set(-ROOM.w / 2 - ROOM.T * 0.6, 0, DOOR_Z1);      // the hinge line: the north jamb, at the leaf's plane
  leaf.position.set(ROOM.w / 2 + ROOM.T * 0.6, 0, -DOOR_Z1);
  hinge.add(leaf);
  scene.add(hinge);
  // daylight in the passage behind the door: a soft bright card (the corridor's windows)
  const passage = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 3.0), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.4, 1.35, 1.25) }));
  passage.position.set(-ROOM.w / 2 - ROOM.T - 0.9, 1.4, (DOOR_Z0 + DOOR_Z1) / 2);
  passage.rotation.y = Math.PI / 2;
  scene.add(passage);
  // the corridor's daylight spilling through the door: a soft source well beyond the doorway and above
  // head height (a light just behind a head shines THROUGH the skin shader's wrap/transmission: faces
  // in the doorway glowed red)
  const passLight = new THREE.PointLight(new THREE.Color(0.8, 0.85, 0.95), 0, 10, 2);
  passLight.position.set(-ROOM.w / 2 - ROOM.T - 2.6, 3.0, (DOOR_Z0 + DOOR_Z1) / 2 + 0.6);
  scene.add(passLight);

  const linenY = makeLinenY(cloth);
  // the key lamp low on the nest's south-east board (F4), its light shadowed only for masters
  const clay = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.32, 0.17, 0.09), roughness: 0.75 });
  const flameMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 4.2, 1.2) });
  const keyLamp = (() => {
    const g = new THREE.Group();
    const prof = [[0, 0], [0.05, 0], [0.075, 0.03], [0.06, 0.05], [0.015, 0.06], [0.0, 0.06]].map(([r, y]) => new THREE.Vector2(r, y));
    const body = new THREE.Mesh(new THREE.LatheGeometry(prof, 32), clay); body.scale.set(1, 1, 1.4); body.castShadow = true; g.add(body);
    const fl = new THREE.Mesh(new THREE.SphereGeometry(0.008, 12, 10), flameMat); fl.scale.set(1, 2.6, 1); fl.position.set(0, 0.085, 0.07); g.add(fl);
    const L = new THREE.PointLight(new THREE.Color(1.0, 0.52, 0.2), 1.1, 0, 2);
    L.position.set(0, 0.09, 0.07);
    if (!draft) { L.castShadow = true; L.shadow.mapSize.set(1024, 1024); L.shadow.bias = -0.004; L.shadow.normalBias = 0.01; L.shadow.camera.near = 0.03; L.shadow.camera.far = 12; L.shadow.radius = 4; }
    g.add(L);
    g.position.set(-0.5, NEST.TOP + 0.002, 1.24);
    scene.add(g);
    L.userData.dirScale = 1;
    return { g, L, base: 1.1 };
  })();
  lamps.push(keyLamp.L);
  lampBase.push(keyLamp.base);

  // an egg fill for the macros (a lamp carried close / a bounce card off the linen, as a crew would
  // add): warm, from the key lamp's side (south-west of the egg), off unless a shot asks (set.eggFill)
  const eggFill = new THREE.PointLight(new THREE.Color(1.0, 0.56, 0.26), 0, 3, 2);
  scene.add(eggFill);
  // the title's rim lamp (T-01): a warm lamp just out of frame behind-left of the egg
  const titleLamp = new THREE.PointLight(new THREE.Color(1.0, 0.55, 0.22), 0, 3, 2);
  scene.add(titleLamp);
  // ---- the egg (props library): closed (with its old fracture), cracked, opened. It stands on its
  // blunt end in the bedding (the props egg's own orientation, a slight lean); the hatchling breaks
  // out of the narrow top. 0.6 m tall: a 1 m newborn lies curled inside it.
  const vk = await verdorKit(ctx);
  const EH = 0.6;
  const eggY = linenY(EGG[0], EGG[2]) - 0.035;                     // pressed a little into the bedding
  // the shell's look follows style frame F4 (a dark, slightly glossy, finely pitted leathery shell);
  // the props egg's own shell material reads pale in a macro under this chamber's light
  const shellMat = new THREE.MeshPhysicalMaterial({ color: new THREE.Color(0.035, 0.03, 0.026), roughness: 0.62, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.55 });
  shellMat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEP;').replace('#include <begin_vertex>', '#include <begin_vertex>\nvEP = position;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', `#include <common>
varying vec3 vEP;
float eh(vec3 p){p=fract(p*0.1031);p+=dot(p,p.zyx+31.32);return fract((p.x+p.y)*p.z);}`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{ vec3 q = vEP * 90.0; vec3 i = floor(q); vec3 f = smoothstep(0.0, 1.0, fract(q));
  float h = mix(mix(mix(eh(i), eh(i + vec3(1,0,0)), f.x), mix(eh(i + vec3(0,1,0)), eh(i + vec3(1,1,0)), f.x), f.y),
                mix(mix(eh(i + vec3(0,0,1)), eh(i + vec3(1,0,1)), f.x), mix(eh(i + vec3(0,1,1)), eh(i + vec3(1,1,1)), f.x), f.y), f.z);
  vec3 dpx = dFdx(-vViewPosition), dpy = dFdy(-vViewPosition);
  float hx = dFdx(h), hy = dFdy(h);
  vec3 r1 = cross(dpy, normal), r2 = cross(normal, dpx);
  float det = dot(dpx, r1);
  normal = normalize(abs(det) * normal - sign(det) * (hx * r1 + hy * r2) * 0.0015); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{ float sp = step(0.93, eh(floor(vEP * 260.0))) * 0.6 + 0.4 * eh(floor(vEP * 60.0)); diffuseColor.rgb *= 0.8 + 0.5 * sp; }`);
  };
  shellMat.customProgramCacheKey = () => 'dk-dir-eggshell';
  const eggs = {};
  for (const state of ['closed', 'cracked', 'opened']) {
    const g = new THREE.Group();
    const e = vk.egg({ o: new THREE.Vector3(0, 0, 0), x: new THREE.Vector3(1, 0, 0), y: new THREE.Vector3(0, 1, 0), z: new THREE.Vector3(0, 0, 1) }, { state, h: EH, seed: 7 });
    e.traverse((o) => { if (o.isMesh && o.material === vk.mats.shell) o.material = shellMat; });
    g.add(e);
    g.position.set(EGG[0], eggY, EGG[2]);
    g.rotation.set(0.05, 0.6, -0.04);
    g.visible = false;
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(g);
    eggs[state] = g;
  }
  eggs.closed.updateMatrixWorld(true);
  // the egg's own frame (for cracks and fragments): centre, long axis (blunt end -> narrow top)
  const eggQ = eggs.closed.quaternion.clone();
  const eggCentre = new THREE.Vector3(0, EH / 2, 0).applyQuaternion(eggQ).add(eggs.closed.position);
  const eggAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(eggQ);
  const Rq = EH * 0.36;
  // a surface point: u in -1..1 along the axis (1 = the narrow top), phi round it (0 = toward the
  // camera side, south +z; pi/2 = east)
  const eggPoint = (u, phi, lift = 0.0015) => {
    const r = Rq * Math.sqrt(Math.max(0, 1 - u * u)) * (1 - 0.16 * u);
    const d = new THREE.Vector3(Math.sin(phi), 0, Math.cos(phi)).applyQuaternion(eggQ);
    return eggCentre.clone().addScaledVector(eggAxis, u * EH / 2).addScaledVector(d, r + lift);
  };
  // the real shell surface (the props egg has noise and a lean the ellipsoid above does not know):
  // ray-cast from outside toward the axis onto the closed egg's outer shell
  const shellMeshes = [];
  eggs.closed.traverse((o) => { if (o.isMesh && o.material === shellMat) shellMeshes.push(o); });
  eggs.closed.updateMatrixWorld(true);
  const ray = new THREE.Raycaster();
  const eggSurf = (u, phi, lift = 0.0015) => {
    const out = eggPoint(u, phi, 0.15);
    const axisP = eggCentre.clone().addScaledVector(eggAxis, u * EH / 2);
    const dir = axisP.clone().sub(out).normalize();
    ray.set(out, dir); ray.far = 1;
    const hit = ray.intersectObjects(shellMeshes, false)[0];
    return hit ? hit.point.clone().addScaledVector(dir, -lift) : eggPoint(u, phi, lift);
  };
  // the growing crack (1A-01): from the old fracture near the top, wandering toward the narrow end
  const crackMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.004, 0.003, 0.002), side: THREE.DoubleSide });
  const cpts = [];
  for (let i = 0; i <= 60; i++) {
    const s = i / 60;
    const u = 0.55 - 0.6 * s, phi = -0.25 + 0.55 * s + 0.12 * Math.sin(s * 23) + 0.05 * Math.sin(s * 71);
    const p = eggSurf(u, phi, 0.0012);
    const p2 = eggSurf(u + 0.01, phi, 0.0012);
    const nrm = p.clone().sub(eggCentre).normalize();
    const sd = new THREE.Vector3().crossVectors(p2.clone().sub(p).normalize(), nrm).normalize();
    cpts.push({ p, side: sd, w: 0.0011 * (1 - 0.6 * s) });
  }
  const crack = crackLine(cpts, crackMat);
  crack.visible = false;
  scene.add(crack);
  // a loose shell fragment (1A-06 shifts, 1A-07 pushed out, 1A-08 lifts away and drops)
  const fragGeo = (() => {
    const g = new THREE.BufferGeometry();
    const n = 10, pos = [], idx = [];
    for (let i = 0; i <= n; i++) for (let j = 0; j <= n; j++) {
      const u = 0.42 + 0.2 * (i / n), phi = 0.1 + 0.55 * (j / n);
      const edge = Math.min(i, n - i, j, n - j);
      const p = eggSurf(u, phi, 0.0025 + 0.0006 * (edge === 0 ? 0 : 1)).sub(eggCentre);
      pos.push(p.x, p.y, p.z);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { const a = i * (n + 1) + j, b = a + 1, c = a + n + 1, d = c + 1; idx.push(a, c, b, b, c, d); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx); g.computeVertexNormals();
    return g;
  })();
  const fragMat = shellMat.clone(); fragMat.side = THREE.DoubleSide; fragMat.onBeforeCompile = shellMat.onBeforeCompile; fragMat.customProgramCacheKey = () => 'dk-dir-eggshell-ds';
  const frag = new THREE.Mesh(fragGeo, fragMat);
  frag.castShadow = frag.receiveShadow = true;
  const fragPivot = new THREE.Group(); fragPivot.position.copy(eggCentre); fragPivot.add(frag); fragPivot.visible = false;
  scene.add(fragPivot);
  // folded linen cloth for Alexandria's hands (1A-17): a small folded stack she holds
  const foldMat = vk.mats.linenFold || new THREE.MeshStandardMaterial({ color: 0xd8d0c0 });
  const fold = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.018, 0.22, 6, 1, 6), foldMat);
  fold.castShadow = fold.receiveShadow = true; fold.visible = false;
  scene.add(fold);

  // Alexandria's stool, east of the nest (she sits facing west, toward the egg)
  {
    const pk = new PropKit();
    propStool(pk, pframe([1.39, 0, -0.14]), prng(5), { h: 0.44, r: 0.17 });
    const sg = vk.build(pk, 'alex-stool');
    sg.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    scene.add(sg);
  }

  // ---- marks (VERDOR frame)
  const bed = (x, z) => linenY(x, z);
  const marks = {
    nest: [NEST_C[0], 0.45, NEST_C[2]], egg: eggCentre.toArray(), eggTop: eggCentre.clone().addScaledVector(eggAxis, EH * 0.47).toArray(), eggCrack: eggSurf(0.3, 0.1, 0).toArray(), eggFrag: eggSurf(0.52, 0.37, 0).toArray(),
    door: [DOOR_C[0], 1.3, DOOR_C[2]], doorway: [DOOR_C[0] + 0.7, 0, DOOR_C[2]], doorOut: [DOOR_C[0] - 1.6, 0, DOOR_C[2]],
    window: [ROOM.w / 2, 3.95, -0.35], windowFloor: [-1.2, 0, -0.2],
    stool: [NEST_C[0] + 2.05, 0, NEST_C[2] + 0.6],
    alex: [1.15, 0, -0.05], alexKneel: [0.95, 0, 0.55], alexDoor: [DOOR_C[0] + 0.9, 0, DOOR_C[2] + 0.2],
    attendant: [-2.25, 0, 0.25], attendant2: [-2.6, 0, -0.75], attendantDoor: [DOOR_C[0] + 0.8, 0, DOOR_C[2] + 0.5],
    abby: [-0.45, 0, 1.75], abbyStand: [-0.65, 0, 2.0], remi: [-1.35, 0, 2.15], remiBack: [-1.75, 0, 1.9],
    hatchRest: [0.12, bed(0.12, 0.12), 0.12],
    lampKey: [-0.5, NEST.TOP + 0.09, 1.31], lampNorth: [-0.95, 0.7, -2.55],
    bench: [-0.4, 0.62, -2.6],
  };
  for (const k of ['alex', 'alexKneel', 'attendant', 'attendant2', 'abby', 'abbyStand', 'remi', 'remiBack', 'stool', 'doorway', 'alexDoor', 'attendantDoor', 'doorOut']) marks[k][1] = 0;
  const objects = { egg: eggs.closed, eggCracked: eggs.cracked, eggOpened: eggs.opened, frag: fragPivot, fold, door: hinge, crack, keyLamp: keyLamp.g };

  // ground: the flag floor, the nest's linen / straw inside the frame
  const ground = (x, z) => {
    if (Math.abs(x - NEST_C[0]) < NEST.A && Math.abs(z - NEST_C[2]) < NEST.B) return bed(x, z) - 0.01;
    return 0;
  };

  let curEgg = null;
  const api = {
    marks, objects, ground, lamps, linenY: bed, eggPoint, eggCentre, eggAxis,
    point(name) {
      if (name === 'hatchRest') return new THREE.Vector3(...marks.hatchRest);
      return null;
    },
    /** per shot: light, the egg's state, the door, the crack, effects (info.spec.set) */
    applyShot(info) {
      const st = info.spec.set || {};
      const t = info.local;
      const c = info.cont;
      // sun: on through the window, or off (TITLE: before dawn)
      if (c.sun) {
        const S = new THREE.Vector3(...c.sun).normalize();
        sun.visible = true; sun.intensity = 2.3 * (st.sun ?? 1);
        sun.position.copy(sun.target.position).addScaledVector(S, 20);
      } else { sun.visible = false; }
      if (ctx.cinematic?.volumetrics) ctx.cinematic.volumetrics.density = (st.dust ?? 1) * (c.sun ? 0.12 : 0.02);
      // lamps: continuity level x the shot's own trim (TITLE: only the key lamp burns)
      const lv = (c.lamps ?? 1) * (st.lamps ?? 1);
      lamps.forEach((l, i) => { l.userData.dirScale = (st.onlyKeyLamp && l !== keyLamp.L ? 0 : lv) * (l === keyLamp.L ? (st.keyLamp ?? 1) : 1); l.intensity = lampBase[i] * l.userData.dirScale; });
      keyLamp.g.visible = st.keyLamp !== false;
      if (st.titleLamp) { titleLamp.position.set(...st.titleLamp.at); titleLamp.intensity = st.titleLamp.intensity ?? 0.6; } else titleLamp.intensity = 0;
      // the egg fill: set.eggFill = intensity (or { intensity, heading (deg, from the egg), dist, rise })
      {
        const f = typeof st.eggFill === 'number' ? { intensity: st.eggFill } : st.eggFill || null;
        eggFill.intensity = f ? f.intensity ?? 0.4 : 0;
        if (f) {
          const hd = ((f.heading ?? 205) * Math.PI) / 180, dd = f.dist ?? 0.8;
          eggFill.position.set(eggCentre.x + Math.sin(hd) * dd, eggCentre.y + (f.rise ?? 0.15), eggCentre.z - Math.cos(hd) * dd);
        }
      }
      // the egg
      const state = st.egg ?? 'closed';
      for (const [k, g] of Object.entries(eggs)) g.visible = k === state;
      curEgg = state === 'none' ? null : eggs[state];
      // the growing crack: st.crack = progress (number or keys)
      const cp = st.crack == null ? null : keyed(t, st.crack);
      crack.visible = cp != null && cp > 0.001 && state !== 'none';
      if (crack.visible) crack.geometry.setDrawRange(0, Math.max(0, Math.floor((crack.userData.nTri / 6) * clamp(cp)) * 6));
      // the loose fragment: st.frag = { shift (rad keys), push (m keys), lift (0..1 keys) }
      if (st.frag) {
        fragPivot.visible = true;
        const sh = keyed(t, st.frag.shift ?? 0), push = keyed(t, st.frag.push ?? 0), lift = keyed(t, st.frag.lift ?? 0);
        const nrm = eggPoint(0.52, 0.37, 0).sub(eggCentre).normalize();
        fragPivot.position.copy(eggCentre).addScaledVector(nrm, push + 0.18 * Math.sin(Math.PI * clamp(lift)) * 0.5 + 0.03 * lift);
        // lifts, turns over, drops onto the linen beside the egg
        const dropTo = new THREE.Vector3(eggCentre.x - 0.32, bed(eggCentre.x - 0.32, eggCentre.z + 0.18) + 0.01, eggCentre.z + 0.18);
        if (lift > 0) {
          const k = ease('inOut', clamp(lift));
          const arc = new THREE.Vector3().copy(eggCentre).lerp(dropTo.clone().sub(eggPoint(0.52, 0.37, 0).sub(eggCentre)), k);
          arc.y += 0.12 * Math.sin(Math.PI * k);
          fragPivot.position.copy(arc);
        }
        fragPivot.rotation.set(0, 0, sh + 2.4 * ease('inOut', clamp(lift)));
        fragPivot.updateMatrixWorld(true);
      } else fragPivot.visible = false;
      // the door: st.door = opening 0..1 (keys)
      const dOpen = keyed(t, st.door ?? 0);
      hinge.rotation.y = -dOpen * 1.75;
      hinge.updateMatrixWorld(true);
      // set.passLight trims the light the passage throws in (a silhouette in the doorway wants the
      // bright card behind it, not a lamp behind the heads: skin transmits it and faces glow)
      passLight.intensity = 9 * clamp(dOpen * 2) * (st.passage ?? 1) * (st.passLight ?? 1);
      passage.material.color.setRGB(1.4, 1.35, 1.25).multiplyScalar(st.passage ?? 1);
      // set.passageCard: the card's distance beyond the wall's outer face (default 0.9 m)
      passage.position.x = -ROOM.w / 2 - ROOM.T - (st.passageCard ?? 0.9);
      passage.visible = dOpen > 0.01;
      fold.visible = false;
    },
    afterCast(info, actors) {
      const st = info.spec.set || {};
      // the folded cloth in Alexandria's hands (1A-17)
      if (st.foldInHands && actors.alexandria) {
        const a = actors.alexandria.ch;
        const wl = a.bone('wrist.L').getWorldPosition(new THREE.Vector3()), wr = a.bone('wrist.R').getWorldPosition(new THREE.Vector3());
        const c = wl.clone().add(wr).multiplyScalar(0.5);
        fold.position.copy(c).add(new THREE.Vector3(0, 0.035, 0));
        fold.lookAt(c.clone().add(new THREE.Vector3(0, 0.035, 0)).add(wl.clone().sub(wr).cross(new THREE.Vector3(0, 1, 0)).normalize()));
        fold.visible = true;
        fold.updateMatrixWorld(true);
      }
    },
    dynamic(info) {
      const d = [];
      const st = info.spec.set || {};
      if (st.frag) d.push(fragPivot);
      if (st.foldInHands) d.push(fold);
      if (st.door != null && typeof st.door !== 'number') d.push(hinge);
      if (st.eggRock && curEgg) d.push(curEgg);
      return d;
    },
  };
  return api;
}
