// The prologue island at runtime (see island-world.js): the baked, erosion-shaped heightmap as a
// graded heightfield (fine toward the camera), the landscape shader in its basalt profile, and
// basalt sea stacks off the shore that faces the camera.
//
//   const isl = await loadPrologueIsland(ctx, { views: [[x, y, z]] });
//   scene.add(isl.group);   isl.heightAt(x, z), isl.world
import * as THREE from 'three';
import { createIslandWorld } from './island-world.js';
import { decodeHeightmap, heightSampler } from './heightmap.js';
import { landscapeMaterial } from './materials.js';
import { heightfield, gradedAxis } from '../sets/terrain.js';
import { meshTile } from './mesher.js';
import { makeNoise, mulberry, smax } from './noise.js';

const CACHE = new URL('./cache/island/', import.meta.url);

export async function loadPrologueIsland(ctx, opts = {}) {
  const W = createIslandWorld(opts.island);
  const r = await fetch(new URL('island.dkhm', CACHE));
  if (!r.ok) throw new Error('nature cache missing: island.dkhm - run node scenes/lib/nature/offline/bake-island.mjs');
  const hm = heightSampler(decodeHeightmap(await r.arrayBuffer()));
  const heightAt = (x, z) => (hm.inside(x, z) ? hm.sample(x, z) : W.base(x, z));
  const { cx, cz, rx, rz } = W.I;
  const view = new THREE.Vector3(...(opts.views?.[0] || [cx, 0, cz + 2000]));
  // grid: finer toward the camera's side of the island
  const toCam = new THREE.Vector2(view.x - cx, view.z - cz).normalize();
  const fx = cx + toCam.x * rx * 0.95, fz = cz + toCam.y * rz * 0.95;
  const n = opts.resolution || [900, 700];
  const hf = heightfield({
    xs: gradedAxis(cx - rx * 1.35, cx + rx * 1.35, n[0], fx, 1.8), zs: gradedAxis(cz - rz * 1.45, cz + rz * 1.45, n[1], fz, 1.8),
    height: heightAt,
    skip: (a, b, c, d) => Math.max(a, b, c, d) < -12,
  });
  const g = hf.geometry, nv = g.attributes.position.count;
  g.setAttribute('aAO', new THREE.BufferAttribute(new Uint8Array(nv).fill(255), 1, true));
  g.setAttribute('aCav', new THREE.BufferAttribute(new Uint8Array(nv), 1, true));
  const material = opts.material || await landscapeMaterial(ctx, {
    world: W, profile: 'basalt', dipLinear: [0.012, -0.008, -0.012 * cx + 0.008 * cz, 1], guano: 0.4, lichen: 0.6, ...opts.look,
  });
  const group = new THREE.Group();
  group.name = 'prologue-island';
  const land = new THREE.Mesh(g, material);
  land.name = 'island-land';
  land.receiveShadow = true; land.castShadow = opts.castShadow ?? false;
  group.add(land);
  // basalt stacks off the camera-facing shore (columnar, stepped by flows, capped green)
  const rr = mulberry(31), N = makeNoise(41);
  const stacks = [];
  for (let k = 0; k < (opts.stacks ?? 7); k++) {
    const a = Math.atan2(toCam.y * rz, toCam.x * rx) + (rr() - 0.5) * 1.6;
    // walk out from the centre to the shore, then offshore a little
    let d = 0.7; while (d < 1.4 && heightAt(cx + Math.cos(a) * rx * d, cz + Math.sin(a) * rz * d) > 0) d += 0.01;
    const off = 40 + rr() * 160;
    const sx = cx + Math.cos(a) * (rx * d + off), sz = cz + Math.sin(a) * (rz * d + off);
    const H = 25 + rr() * 85, R = 8 + rr() * 16;
    stacks.push({ x: sx, z: sz, H, R, seed: k });
  }
  const smat = material;
  for (const st of stacks) {
    const sdf = (x, y, z) => {
      const lx = x - st.x, lz = z - st.z;
      const taper = 1 - 0.35 * Math.max(0, y) / st.H;
      let d = Math.hypot(lx * 1.15, lz) - st.R * taper * (1 + 0.18 * N.n2(Math.atan2(lz, lx) * 1.5 + st.seed, y / 9));
      // flows: harder bands stand proud
      const s = y + W.dipH(x, z);
      d += (1 - W.hardAt(s)) * 1.6 + 0.6 * N.facet3(x / 4, y / 5, z / 4);
      d = smax(d, y - st.H - 2 * N.n2(lx / 6, lz / 6 + st.seed), 2.5);
      return Math.max(d, -25 - y);
    };
    const world = { column: () => null, sdf };
    const size = st.R * 2.8;
    const m = meshTile(world, { x0: st.x - size / 2, z0: st.z - size / 2, size, h: Math.max(0.8, size / 60), apron: 1, coarse: 1, ylo: -14, yhi: st.H + 4, aoDistances: [1, 3, 8] });
    const sg = new THREE.BufferGeometry();
    const sv = m.positions.length / 3;
    sg.setAttribute('position', new THREE.BufferAttribute(m.positions, 3));
    const n3 = new Int8Array(sv * 3); for (let i = 0; i < sv; i++) { n3[i * 3] = m.normals[i * 4]; n3[i * 3 + 1] = m.normals[i * 4 + 1]; n3[i * 3 + 2] = m.normals[i * 4 + 2]; }
    sg.setAttribute('normal', new THREE.BufferAttribute(n3, 3, true));
    sg.setAttribute('aAO', new THREE.BufferAttribute(m.ao, 1, true));
    sg.setAttribute('aCav', new THREE.BufferAttribute(m.cavity, 1, true));
    sg.setIndex(new THREE.BufferAttribute(m.indices, 1));
    sg.computeBoundingSphere();
    const mesh = new THREE.Mesh(sg, smat);
    mesh.receiveShadow = true; mesh.castShadow = opts.castShadow ?? false;
    group.add(mesh);
  }
  return { group, world: W, heightAt, material, stacks };
}
