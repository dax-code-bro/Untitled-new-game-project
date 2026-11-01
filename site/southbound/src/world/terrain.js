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

export function createTerrain(hm, quality, scene, surf) {
  const group = new THREE.Group();
  group.name = 'terrain';
  const chunks = 8;
  const segs = Math.max(16, Math.round(quality.terrainSegs / chunks));
  const size = WORLD.size / chunks;
  const mat = makeTerrainMaterial(quality, surf);
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

function makeTerrainMaterial(quality, surf) {
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.92, metalness: 0 });
  const useN = surf && surf.hasNormals ? 1 : 0;
  const L = ['grass', 'dry', 'forest', 'sand', 'rock'];
  const size = (k) => (surf ? surf[k].size : 3).toFixed(2);
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    for (const k of L) {
      shader.uniforms[`t_${k}C`] = { value: surf ? surf[k].color : null };
      shader.uniforms[`t_${k}N`] = { value: surf ? surf[k].normal : null };
    }
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWNrm;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed,1.0)).xyz;\nvWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec3 vWNrm;
uniform sampler2D uSplatTex; uniform float uWorldHalf; uniform float uNight;
${L.map((k) => `uniform sampler2D t_${k}C; uniform sampler2D t_${k}N;`).join('\n')}
${GLSL_NOISE}
float sbRough; vec3 sbNrm; float sbFar;
// Faithful sample at true scale. Far away, blend in a rotated 4x-larger
// sample to hide repetition (never near the camera, where it would blur).
vec3 layerC(sampler2D t, vec2 p, float scale){
  vec3 a = texture2D(t, p / scale).rgb;
  if (sbFar > 0.001) {
    vec3 b = texture2D(t, mat2(0.8, -0.6, 0.6, 0.8) * p / (scale * 4.3)).rgb;
    a = mix(a, b, sbFar * 0.5);
  }
  return a;
}
vec3 layerN(sampler2D t, vec2 p, float scale){ return texture2D(t, p / scale).xyz * 2.0 - 1.0; }
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 wuv = (vWPos.xz + uWorldHalf) / (2.0*uWorldHalf);
  vec4 sp = texture2D(uSplatTex, clamp(wuv, 0.0, 1.0));
  if (abs(vWPos.x) > uWorldHalf || abs(vWPos.z) > uWorldHalf) sp = vec4(vWPos.y < 2.0 ? 1.0 : 0.0, 0.35, 0.3, 0.0);
  float dist = length(vWPos - cameraPosition);
  sbFar = smoothstep(30.0, 160.0, dist);
  vec3 n = normalize(vWNrm);
  float slope = 1.0 - clamp(n.y, 0.0, 1.0);
  vec2 p = vWPos.xz;

  vec3 cG = layerC(t_grassC, p, ${size('grass')});
  vec3 cD = layerC(t_dryC, p, ${size('dry')});
  vec3 cF = layerC(t_forestC, p, ${size('forest')});
  vec3 cS = layerC(t_sandC, p, ${size('sand')});
  // rock: triplanar so cliffs don't stretch
  vec3 tw = pow(abs(n), vec3(4.0)); tw /= (tw.x + tw.y + tw.z);
  float rs = ${size('rock')};
  vec3 cR = texture2D(t_rockC, vWPos.zy / rs).rgb * tw.x + texture2D(t_rockC, vWPos.xz / rs).rgb * tw.y + texture2D(t_rockC, vWPos.xy / rs).rgb * tw.z;

  // splat weights, sharpened by each texture's own brightness (height blend)
  float wR = smoothstep(0.30, 0.52, slope);
  float wS = sp.r, wF = sp.g, wD = sp.b;
  float wG = max(0.0, 1.0 - wS - wF - wD);
  vec4 h = vec4(dot(cG, vec3(0.333)), dot(cD, vec3(0.333)), dot(cF, vec3(0.333)), dot(cS, vec3(0.333)));
  vec4 w = vec4(wG, wD, wF, wS) * pow(h + 0.25, vec4(4.0)) + 1e-5;
  w /= (w.x + w.y + w.z + w.w);
  vec3 c = cG * w.x + cD * w.y + cF * w.z + cS * w.w;
  c = mix(c, cR, wR);
  // only far away: gentle large-scale variation so hills don't look uniform
  c *= mix(1.0, 0.9 + 0.2 * sbFbm(vWPos.xz * 0.008), sbFar);
  float snow = smoothstep(190.0, 230.0, vWPos.y) * (1.0 - smoothstep(0.35, 0.6, slope));
  c = mix(c, vec3(0.9, 0.92, 0.95), snow);
  c = mix(c, vec3(0.09, 0.09, 0.095), sp.a);
  diffuseColor.rgb = c;
  sbRough = mix(0.97, 0.85, sp.a) - snow * 0.4 - wR * 0.12;

  vec3 nt = vec3(0.0, 0.0, 1.0);
  if (${useN}.0 > 0.5) {
    nt = layerN(t_grassN, p, ${size('grass')}) * w.x + layerN(t_dryN, p, ${size('dry')}) * w.y
       + layerN(t_forestN, p, ${size('forest')}) * w.z + layerN(t_sandN, p, ${size('sand')}) * w.w;
    vec3 nr = texture2D(t_rockN, (abs(n.x) > abs(n.z) ? vWPos.zy : vWPos.xy) / rs).xyz * 2.0 - 1.0;
    nt = mix(nt, nr, wR);
    nt.xy *= (1.0 - sbFar * 0.7) * (1.0 - sp.a);
  }
  sbNrm = nt;
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = sbRough;')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  vec3 N = normalize(vWNrm);
  vec3 T = normalize(vec3(1.0, 0.0, 0.0) - N * N.x);
  vec3 B = normalize(cross(N, T));
  vec3 nw = normalize(T * sbNrm.x - B * sbNrm.y + N * max(sbNrm.z, 0.15));
  normal = normalize((viewMatrix * vec4(nw, 0.0)).xyz);
}`);
  };
  return mat;
}
