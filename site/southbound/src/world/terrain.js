// Terrain meshes (chunked for culling) + horizon ring + procedural shader.
import * as THREE from 'three';
import { WORLD } from './layout.js';
import { baseHeight } from './heightmap.js';
import { GLSL_NOISE } from '../util.js';

export function makeWorldTextures(hm) {
  const n = hm.n;
  const half = new Uint16Array(n * n);
  for (let k = 0; k < n * n; k++) half[k] = THREE.DataUtils.toHalfFloat(hm.h[k]);
  const heightTex = new THREE.DataTexture(half, n, n, THREE.RedFormat, THREE.HalfFloatType);
  heightTex.magFilter = heightTex.minFilter = THREE.LinearFilter;
  heightTex.needsUpdate = true;
  const splatTex = new THREE.DataTexture(hm.splat, n, n, THREE.RGBAFormat, THREE.UnsignedByteType);
  splatTex.magFilter = splatTex.minFilter = THREE.LinearFilter;
  splatTex.needsUpdate = true;
  return { heightTex, splatTex };
}

export const worldUniforms = {
  uTime: { value: 0 },
  uNight: { value: 0 },
  uHeightTex: { value: null },
  uSplatTex: { value: null },
  uWorldHalf: { value: WORLD.half },
};

export function createTerrain(hm, quality, scene) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const chunks = 8;
  const segs = Math.max(16, Math.round(quality.terrainSegs / chunks));
  const size = WORLD.size / chunks;
  const mat = makeTerrainMaterial(quality);
  const nrm = new THREE.Vector3();
  const meshes = [];

  for (let cj = 0; cj < chunks; cj++) {
    for (let ci = 0; ci < chunks; ci++) {
      const x0 = -WORLD.half + ci * size, z0 = -WORLD.half + cj * size;
      const vn = segs + 1;
      // vertices + one ring of skirt vertices around the edge
      const pos = [], norm = [], idx = [];
      for (let j = 0; j < vn; j++) for (let i = 0; i < vn; i++) {
        const x = x0 + (i / segs) * size, z = z0 + (j / segs) * size;
        pos.push(x, hm.height(x, z), z);
        hm.normal(x, z, nrm);
        norm.push(nrm.x, nrm.y, nrm.z);
      }
      for (let j = 0; j < segs; j++) for (let i = 0; i < segs; i++) {
        const a = j * vn + i, b = a + 1, c = a + vn, d = c + 1;
        idx.push(a, c, b, b, c, d);
      }
      // Skirts hide cracks between chunks and the horizon mesh
      const edge = (list) => {
        const base = pos.length / 3;
        for (const v of list) {
          pos.push(pos[v * 3], pos[v * 3 + 1] - 12, pos[v * 3 + 2]);
          norm.push(norm[v * 3], norm[v * 3 + 1], norm[v * 3 + 2]);
        }
        for (let k = 0; k < list.length - 1; k++) {
          const a = list[k], b = list[k + 1], c = base + k, d = base + k + 1;
          idx.push(a, b, c, b, d, c, a, c, b, b, c, d);
        }
      };
      const top = [], bot = [], left = [], right = [];
      for (let i = 0; i < vn; i++) { top.push(i); bot.push(segs * vn + i); left.push(i * vn); right.push(i * vn + segs); }
      edge(top); edge(bot); edge(left); edge(right);

      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(norm, 3));
      g.setIndex(idx);
      g.computeBoundingSphere();
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      m.userData.center = new THREE.Vector3(x0 + size / 2, 0, z0 + size / 2);
      group.add(m);
      meshes.push(m);
    }
  }

  // Horizon: the rest of the continent, low-res, sunk where it overlaps the map.
  {
    const S = 16384, seg = 128, step = S / seg;
    const g = new THREE.PlaneGeometry(S, S, seg, seg);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const x = p.getX(k), z = p.getZ(k);
      const inside = Math.abs(x) < WORLD.half - 1 && Math.abs(z) < WORLD.half - 1;
      const onEdge = Math.abs(x) <= WORLD.half + 1 && Math.abs(z) <= WORLD.half + 1;
      let y = onEdge ? hm.height(x, z) : baseHeight(x, z);
      if (inside) y -= 40;
      // Fade far terrain toward a gentle continent-scale shape
      const far = Math.max(Math.abs(x), Math.abs(z));
      if (far > 5000 && z < 0) y += (far - 5000) * 0.06;
      p.setY(k, y);
    }
    void step;
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = false;
    m.name = 'horizon';
    group.add(m);
  }

  scene.add(group);
  return {
    group, meshes,
    update(camPos, drawDistance) {
      for (const m of meshes) {
        const c = m.userData.center;
        m.visible = Math.hypot(c.x - camPos.x, c.z - camPos.z) < drawDistance + 400;
      }
    },
  };
}

function makeTerrainMaterial(quality) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const detail = quality.anisotropy >= 8 ? 1.0 : 0.0;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm;
uniform sampler2D uSplatTex; uniform float uWorldHalf; uniform float uNight;
${GLSL_NOISE}
float sbRough; float sbBump;
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 wuv = (vWPos.xz + uWorldHalf) / (2.0*uWorldHalf);
  vec4 sp = texture2D(uSplatTex, clamp(wuv, 0.0, 1.0));
  bool outside = abs(vWPos.x) > uWorldHalf || abs(vWPos.z) > uWorldHalf;
  if (outside) sp = vec4(vWPos.y < 2.0 ? 1.0 : 0.0, 0.35, 0.3, 0.0);
  float dist = length(vWPos - cameraPosition);
  float fade = 1.0 - smoothstep(60.0, 450.0, dist);
  float macro = sbFbm(vWPos.xz*0.012);
  float micro = sbNoise(vWPos.xz*0.9) * fade;
  float slope = 1.0 - clamp(vWNrm.y, 0.0, 1.0);

  vec3 grass = mix(vec3(0.16,0.27,0.07), vec3(0.30,0.36,0.11), macro);
  grass = mix(grass, vec3(0.22,0.30,0.09), micro*0.5);
  vec3 dry   = mix(vec3(0.50,0.42,0.20), vec3(0.62,0.52,0.28), macro);
  vec3 forest= mix(vec3(0.13,0.11,0.06), vec3(0.17,0.20,0.08), sbNoise(vWPos.xz*0.15));
  vec3 sand  = mix(vec3(0.58,0.50,0.36), vec3(0.66,0.58,0.42), sbNoise(vWPos.xz*0.3));
  vec3 mud   = vec3(0.24,0.20,0.14);
  vec3 rock  = mix(vec3(0.36,0.34,0.32), vec3(0.52,0.49,0.45), sbFbm(vec2(vWPos.x+vWPos.z, vWPos.y*3.0)*0.08));
  vec3 paved = mix(vec3(0.085,0.085,0.09), vec3(0.12,0.12,0.125), micro);

  vec3 c = grass;
  c = mix(c, dry, sp.b);
  c = mix(c, forest, sp.g*0.85);
  vec3 shore = mix(sand, mud, smoothstep(0.3,0.7,sbNoise(vWPos.xz*0.02)) * step(3.0, vWPos.y));
  c = mix(c, shore, sp.r);
  c = mix(c, rock, smoothstep(0.28, 0.5, slope + (macro-0.5)*0.15));
  float snow = smoothstep(190.0, 230.0, vWPos.y + macro*30.0) * (1.0 - smoothstep(0.35,0.6,slope));
  c = mix(c, vec3(0.92,0.94,0.97), snow);
  c = mix(c, paved, sp.a);
  if (vWPos.y < 0.0) c = mix(c, vec3(0.45,0.42,0.32), 0.4);
  diffuseColor.rgb = c;
  sbRough = mix(0.95, 0.75, sp.a) - snow*0.4;
  sbBump = (sbNoise(vWPos.xz*1.7)*0.6 + sbNoise(vWPos.xz*6.0)*0.4) * fade * ${detail.toFixed(1)} * (0.6 + slope*2.0) * (1.0 - sp.a*0.7);
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = sbRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 dpdx = dFdx(-vViewPosition), dpdy = dFdy(-vViewPosition);
  float dhx = dFdx(sbBump), dhy = dFdy(sbBump);
  vec3 r1 = cross(dpdy, normal), r2 = cross(normal, dpdx);
  float det = dot(dpdx, r1);
  vec3 grad = sign(det) * (dhx*r1 + dhy*r2) * 0.35;
  normal = normalize(abs(det)*normal - grad);
}`);
  };
  return mat;
}
