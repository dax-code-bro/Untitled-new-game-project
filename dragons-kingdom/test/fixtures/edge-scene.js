// A hard vertical edge (sRGB 0.3 -> 0.7, blue channel) and a horizontal one
// (green) on a flat background: anything an upscaler/sharpener adds beyond
// [0.3, 0.7] is ringing / a halo (test (a4)).
export const meta = { title: 'Edge fixture', duration: 1, toneMapping: 'linear', exposure: 1 };
export async function setup(ctx) {
  const { THREE, scene } = ctx;
  const mat = new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    vertexShader: 'varying vec2 vNdc; void main(){ vNdc = position.xy; gl_Position = vec4(position.xy, 0.0, 1.0); }',
    fragmentShader: `varying vec2 vNdc;
      vec3 eotf(vec3 s){ return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(vec3(0.04045), s)); }
      void main(){ vec3 s = vec3(0.5, vNdc.y > 0.13 ? 0.7 : 0.3, vNdc.x > 0.1 ? 0.7 : 0.3); gl_FragColor = vec4(eotf(s), 1.0); }`,
  });
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  m.frustumCulled = false;
  scene.add(m);
  ctx.renderer.shadowMap.enabled = false;
}
export function update() {}
