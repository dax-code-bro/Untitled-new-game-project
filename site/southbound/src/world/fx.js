// Fire and smoke: camera-facing quads with animated noise shaders. Used for
// burning barrels, burning wrecks and explosions.
import * as THREE from 'three';

const NOISE = `
float fxh(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float fxn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(fxh(i), fxh(i+vec2(1,0)), f.x), mix(fxh(i+vec2(0,1)), fxh(i+vec2(1,1)), f.x), f.y); }`;

export const fxTime = { value: 0 };

const flameMat = new THREE.ShaderMaterial({
  uniforms: { uTime: fxTime, uSeed: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; uniform float uSeed; varying vec2 vUv; ${NOISE}
    void main(){
      vec2 p = vUv; float t = uTime + uSeed * 13.0;
      float n = fxn(vec2(p.x * 5.0, p.y * 4.0 - t * 3.2)) * 0.6 + fxn(vec2(p.x * 11.0, p.y * 8.0 - t * 5.0)) * 0.4;
      float shape = smoothstep(0.5, 0.0, abs(p.x - 0.5) * (1.4 + p.y * 1.6)) * smoothstep(1.0, 0.15, p.y + n * 0.45) * smoothstep(0.0, 0.08, p.y);
      vec3 col = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.35), smoothstep(0.2, 0.9, shape));
      gl_FragColor = vec4(col * shape * 1.6, shape);
    }`,
});
const smokeMat = new THREE.ShaderMaterial({
  uniforms: { uTime: fxTime, uSeed: { value: 0 }, uDark: { value: 0.12 } }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform float uTime; uniform float uSeed; uniform float uDark; varying vec2 vUv; ${NOISE}
    void main(){
      vec2 p = vUv; float t = uTime * 0.45 + uSeed * 7.0;
      float n = fxn(vec2(p.x * 3.0 + sin(t) * 0.3, p.y * 2.5 - t)) * 0.65 + fxn(vec2(p.x * 7.0, p.y * 6.0 - t * 1.7)) * 0.35;
      float w = 0.18 + p.y * 0.32;
      float a = smoothstep(w, 0.0, abs(p.x - 0.5 + (n - 0.5) * 0.25)) * smoothstep(0.0, 0.15, p.y) * smoothstep(1.0, 0.45, p.y) * smoothstep(0.3, 0.7, n + 0.2);
      gl_FragColor = vec4(vec3(uDark) * (0.8 + n * 0.4), a * 0.75);
    }`,
});

// a flame or smoke column of height h at a world point; call fx.face(camera) each frame
export function makeFlame(h = 1, seed = Math.random()) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.72, h).translate(0, h / 2, 0), flameMat.clone());
  m.material.uniforms.uTime = fxTime; m.material.uniforms.uSeed.value = seed;
  m.userData.noHit = true; m.userData.noReflect = true; m.renderOrder = 6;
  return m;
}
export function makeSmoke(h = 4, seed = Math.random(), dark = 0.12) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(h * 0.6, h).translate(0, h / 2, 0), smokeMat.clone());
  m.material.uniforms.uTime = fxTime; m.material.uniforms.uSeed.value = seed; m.material.uniforms.uDark.value = dark;
  m.userData.noHit = true; m.userData.noReflect = true; m.renderOrder = 5;
  return m;
}
export function faceCamera(m, camera) { m.lookAt(camera.position.x, m.getWorldPosition(_p).y, camera.position.z); }
const _p = new THREE.Vector3();
