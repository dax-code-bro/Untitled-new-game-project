// Ocean, lake and river surfaces sharing one animated water shader.
import * as THREE from 'three';
import { LAKE, CHANNELS, lakeRadius } from './layout.js';
import { worldUniforms } from './terrain.js';
import { GLSL_NOISE } from '../util.js';

function makeWaterMaterial(kind) {
  const mat = new THREE.MeshStandardMaterial({
    color: 0xffffff, roughness: 0.06, metalness: 0.0, transparent: true, depthWrite: true, side: THREE.DoubleSide,
  });
  const flow = kind === 'river' ? 1.0 : 0.0;
  const scale = kind === 'ocean' ? 1.0 : 0.6;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, worldUniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec2 aFlow;\nvarying vec3 vWPos;\nvarying vec2 vFlow;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
vFlow = ${flow > 0 ? 'aFlow' : 'vec2(0.0)'};
vec4 wp4 = modelMatrix * vec4(transformed,1.0);
${kind === 'ocean' ? 'float swell = sin(wp4.x*0.02 + uTime*0.8)*0.35 + sin(wp4.z*0.031 - uTime*0.6)*0.25; transformed.y += swell * smoothstep(1400.0, 1700.0, wp4.z); wp4 = modelMatrix * vec4(transformed,1.0);' : ''}
vWPos = wp4.xyz;`)
      .replace('#include <common>', '#include <common>');
    shader.vertexShader = 'uniform float uTime;\n' + shader.vertexShader;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos; varying vec2 vFlow;
uniform float uTime; uniform float uNight; uniform sampler2D uHeightTex; uniform float uWorldHalf;
${GLSL_NOISE}
float sbDepth; float sbFoam;
vec2 waveGrad(vec2 p, float t){
  vec2 g = vec2(0.0);
  // directional waves: (dir, wavelength, amplitude, speed)
  vec2 d1 = normalize(vec2(1.0, 0.6)), d2 = normalize(vec2(-0.7, 1.0)), d3 = normalize(vec2(0.2, -1.0)), d4 = normalize(vec2(-1.0,-0.3));
  float k1 = 6.28/9.0, k2 = 6.28/5.3, k3 = 6.28/2.7, k4 = 6.28/1.3;
  g += d1 * cos(dot(d1,p)*k1 + t*1.3) * k1 * 0.10;
  g += d2 * cos(dot(d2,p)*k2 + t*1.9) * k2 * 0.05;
  g += d3 * cos(dot(d3,p)*k3 + t*2.7) * k3 * 0.022;
  g += d4 * cos(dot(d4,p)*k4 + t*3.9) * k4 * 0.008;
  float e = 0.35;
  float n0 = sbNoise(p*0.9 + t*0.4), nx = sbNoise((p+vec2(e,0.0))*0.9 + t*0.4), nz = sbNoise((p+vec2(0.0,e))*0.9 + t*0.4);
  g += vec2(nx-n0, nz-n0)/e * 0.12;
  return g;
}
`)
      .replace('#include <color_fragment>', `#include <color_fragment>
{
  vec2 wuv = clamp((vWPos.xz + uWorldHalf) / (2.0*uWorldHalf), 0.0, 1.0);
  float ground = texture2D(uHeightTex, wuv).r;
  if (abs(vWPos.x) > uWorldHalf || abs(vWPos.z) > uWorldHalf) ground = -40.0;
  sbDepth = max(vWPos.y - ground, 0.0);
  float fn = sbNoise(vWPos.xz*0.6 + vFlow*uTime*2.0 + uTime*0.3);
  sbFoam = (1.0 - smoothstep(0.0, 0.9 + fn*0.8, sbDepth)) * (0.6 + 0.4*sin(uTime*1.5 + vWPos.x*0.3 + vWPos.z*0.2));
  vec3 shallow = vec3(0.10, 0.36, 0.34);
  vec3 deep = ${kind === 'ocean' ? 'vec3(0.010, 0.07, 0.11)' : 'vec3(0.02, 0.09, 0.07)'};
  vec3 c = mix(shallow, deep, 1.0 - exp(-sbDepth*0.22));
  ${kind === 'river' ? 'c = mix(c, vec3(0.20,0.22,0.14), 0.35);' : ''}
  c = mix(c, vec3(0.9), clamp(sbFoam,0.0,1.0)*0.85);
  diffuseColor.rgb = c * (1.0 - uNight*0.6);
  diffuseColor.a = clamp(mix(0.55, 0.97, 1.0 - exp(-sbDepth*0.35)) + sbFoam*0.4, 0.0, 1.0);
}`)
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = mix(0.04, 0.5, clamp(sbFoam,0.0,1.0));')
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
{
  float dfade = 1.0 - smoothstep(80.0, 900.0, length(vWPos - cameraPosition));
  vec2 g = waveGrad(vWPos.xz*${scale.toFixed(2)} + vFlow*uTime*3.0, uTime) * (0.35 + 0.65*dfade);
  vec3 wn = normalize(vec3(-g.x, 1.0, -g.y));
  normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
}`);
  };
  return mat;
}

export function createWater(scene) {
  const group = new THREE.Group();
  group.name = 'water';

  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(16000, 16000, 200, 200).rotateX(-Math.PI / 2), makeWaterMaterial('ocean'));
  ocean.renderOrder = 1;
  group.add(ocean);

  // Lake: a disc following the shoreline shape
  {
    const segs = 128, pos = [0, LAKE.level, 0], idx = [];
    for (let i = 0; i <= segs; i++) {
      const a = (i / segs) * Math.PI * 2, r = lakeRadius(a) * 1.12;
      pos.push(Math.cos(a) * r, LAKE.level, Math.sin(a) * r);
      if (i > 0) idx.push(0, i + 1, i);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const lake = new THREE.Mesh(g, makeWaterMaterial('lake'));
    lake.position.set(LAKE.x, 0, LAKE.z);
    lake.renderOrder = 1;
    group.add(lake);
  }

  // Rivers and creeks: ribbons along each channel at its water level
  const riverMat = makeWaterMaterial('river');
  for (const c of CHANNELS) {
    const pts = c.pts, wl = c.wl, hw = c.width / 2 + 3;
    const pos = [], flow = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
      let dx = q[0] - o[0], dz = q[1] - o[1];
      const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L;
      const nx = -dz, nz = dx;
      const y = wl[i] + 0.05;
      pos.push(p[0] + nx * hw, y, p[1] + nz * hw, p[0] - nx * hw, y, p[1] - nz * hw);
      flow.push(dx, dz, dx, dz);
      if (i > 0) { const a = (i - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aFlow', new THREE.Float32BufferAttribute(flow, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, riverMat);
    m.renderOrder = 1;
    group.add(m);
  }
  scene.add(group);
  return {
    group,
    update(cam) { ocean.position.x = Math.round(cam.x / 80) * 80; ocean.position.z = Math.round(cam.z / 80) * 80; },
  };
}
