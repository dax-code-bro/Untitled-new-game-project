// Post-processing chain: AO (Ultra) -> bloom -> tone map -> colour grade/vignette -> SMAA.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.28 }, uSat: { value: 1.08 }, uContrast: { value: 1.05 }, uWarm: { value: 0.02 }, uDamage: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uVignette, uSat, uContrast, uWarm, uDamage; varying vec2 vUv;
    void main(){
      vec4 c = texture2D(tDiffuse, vUv);
      float l = dot(c.rgb, vec3(0.299,0.587,0.114));
      c.rgb = mix(vec3(l), c.rgb, uSat);
      c.rgb = (c.rgb - 0.5)*uContrast + 0.5;
      c.rgb += vec3(uWarm, uWarm*0.4, -uWarm*0.6);
      vec2 d = vUv - 0.5;
      float v = 1.0 - dot(d,d)*uVignette*2.2;
      c.rgb *= v;
      c.rgb = mix(c.rgb, vec3(0.6,0.0,0.0), uDamage*smoothstep(0.2,0.7,length(d)));
      gl_FragColor = vec4(clamp(c.rgb,0.0,1.0), c.a);
    }`,
};

export function createPost(renderer, scene, camera, quality) {
  if (!quality.bloom && !quality.ao && quality.aa !== 'smaa') return null;
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  let ao = null, bloom = null, smaa = null;
  if (quality.ao) {
    ao = new GTAOPass(scene, camera, size.x, size.y);
    ao.output = GTAOPass.OUTPUT.Default;
    ao.blendIntensity = 0.85;
    ao.updateGtaoMaterial({ radius: 1.2, distanceExponent: 1.5, thickness: 2, scale: 1.0, samples: 12 });
    composer.addPass(ao);
  }
  if (quality.bloom) {
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.28, 0.45, 0.88);
    composer.addPass(bloom);
  }
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  if (quality.aa === 'smaa') { smaa = new SMAAPass(size.x, size.y); composer.addPass(smaa); }
  return {
    composer, grade, bloom, ao,
    setSize(w, h) { composer.setSize(w, h); },
    render() { composer.render(); },
  };
}
