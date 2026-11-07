// Cinematic post-processing (pmndrs/postprocessing + N8AO, both open source):
//   ambient occlusion -> sun shafts -> depth of field -> bloom
//   -> AgX filmic tone mapping -> colour grade -> vignette + film grain -> SMAA
import * as THREE from 'three';
import {
  EffectComposer, RenderPass, EffectPass, Effect, BlendFunction,
  BloomEffect, ToneMappingEffect, ToneMappingMode, VignetteEffect, NoiseEffect,
  SMAAEffect, SMAAPreset, GodRaysEffect, DepthOfFieldEffect,
} from 'postprocessing';
import { N8AOPostPass } from 'n8ao';

const GRADE_FRAG = /* glsl */`
uniform float uWarm; uniform float uLook; uniform float uDamage; uniform float uSat; uniform float uContrast; uniform float uNight;
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
  vec3 c = inputColor.rgb;
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSat);
  c = 0.18 * pow(max(c, 0.0) / 0.18, vec3(uContrast)); // contrast around mid-grey
  // the warm look (uLook 0 natural .. 1 warm), the same as the Low/Phone tone curve in main.js:
  // a film print's lifted, warm blacks; amber highlights over faintly teal shadows
  c = c * (1.0 - 0.025 * uLook) + vec3(0.022, 0.016, 0.008) * uLook;
  float hi = smoothstep(0.1, 0.75, l);
  c *= mix(mix(vec3(1.0), vec3(0.96 - uWarm * 0.02, 1.0, 1.04 + uWarm * 0.03), uLook), mix(vec3(1.0), vec3(1.07, 1.005, 0.88), uLook), hi);
  // the hours round sunrise and sunset (uWarm 0..1): an amber wash over everything
  float gw = uWarm * mix(0.3, 1.0, hi); // the gold lands on what the sun lights; shadows stay cooler
  c *= vec3(1.0 + gw * 0.16, 1.0 + gw * 0.05, 1.0 - gw * 0.14) * (1.0 + gw * 0.05);
  // moonlit nights lean blue
  c = mix(c, c * vec3(0.8, 0.9, 1.2), uNight * 0.6);
  vec2 d = uv - 0.5;
  c = mix(c, vec3(0.55, 0.0, 0.0), uDamage * smoothstep(0.2, 0.75, length(d)));
  outputColor = vec4(clamp(c, 0.0, 1.0), inputColor.a);
}`;

class GradeEffect extends Effect {
  constructor() {
    super('GradeEffect', GRADE_FRAG, {
      uniforms: new Map([
        ['uWarm', new THREE.Uniform(0)], ['uLook', new THREE.Uniform(1)], ['uDamage', new THREE.Uniform(0)],
        ['uSat', new THREE.Uniform(1.12)], ['uContrast', new THREE.Uniform(1.07)], ['uNight', new THREE.Uniform(0)],
      ]),
    });
  }
}

export function createPost(renderer, scene, camera, quality) {
  if (!quality.bloom && !quality.ao && quality.aa !== 'smaa') return null;
  const composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType, multisampling: 0 });
  composer.addPass(new RenderPass(scene, camera));
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const top = quality.label === 'Ultra' || !!quality.cine;
  const high = quality.label === 'High' || top;

  let ao = null;
  if (quality.ao || high) {
    ao = new N8AOPostPass(scene, camera, size.x, size.y);
    Object.assign(ao.configuration, {
      aoRadius: 1.6, distanceFalloff: 1.0, intensity: 1.4, color: new THREE.Color(0, 0, 0),
      halfRes: !top, aoSamples: quality.cine ? 24 : top ? 16 : 8, denoiseSamples: quality.cine ? 12 : 8,
    });
    composer.addPass(ao);
  }

  // Sun shafts: a sun disc the god-ray effect can see (occluded by buildings/trees)
  let godRays = null, sunMesh = null;
  if (high) {
    sunMesh = new THREE.Mesh(new THREE.SphereGeometry(110, 16, 8), new THREE.MeshBasicMaterial({ color: 0xffe2b0, transparent: true, fog: false, depthWrite: false }));
    sunMesh.frustumCulled = false;
    // not added to the scene: the god-ray effect renders it in its own light pass only
    godRays = new GodRaysEffect(camera, sunMesh, { density: 0.94, decay: 0.92, weight: 0.35, exposure: 0.45, samples: 48, clampMax: 1, resolutionScale: 0.5, blur: true });
    composer.addPass(new EffectPass(camera, godRays));
  }

  let dof = null;
  if (top) {
    dof = new DepthOfFieldEffect(camera, { worldFocusDistance: 8, worldFocusRange: 40, bokehScale: 0, resolutionScale: 0.5 });
    composer.addPass(new EffectPass(camera, dof));
  }

  const bloom = quality.bloom ? new BloomEffect({ mipmapBlur: true, intensity: 0.4, luminanceThreshold: 0.95, luminanceSmoothing: 0.25, radius: 0.7 }) : null;
  if (bloom) composer.addPass(new EffectPass(camera, bloom));

  const grade = new GradeEffect();
  const tone = new ToneMappingEffect({ mode: ToneMappingMode.AGX }); // AgX: neutral hues (ACES pushes brights towards yellow)
  const vignette = new VignetteEffect({ offset: 0.38, darkness: 0.32 });
  const grain = new NoiseEffect({ blendFunction: BlendFunction.OVERLAY, premultiply: false });
  grain.blendMode.opacity.value = 0.025;
  composer.addPass(new EffectPass(camera, tone, grade, vignette, grain));
  if (quality.aa === 'smaa') composer.addPass(new EffectPass(camera, new SMAAEffect({ preset: SMAAPreset.HIGH })));

  const gradeU = { uLook: grade.uniforms.get('uLook'), uWarm: grade.uniforms.get('uWarm'), uDamage: grade.uniforms.get('uDamage'), uNight: grade.uniforms.get('uNight'), uSat: grade.uniforms.get('uSat'), uContrast: grade.uniforms.get('uContrast') };
  return {
    composer,
    grade: { uniforms: gradeU },
    setSize(w, h) { composer.setSize(w, h, false); },
    // per-frame: sun position for shafts, focus distance for depth of field
    update(sunDir, sunVisible, focusDist, aiming) {
      if (sunMesh) {
        sunMesh.position.copy(camera.position).addScaledVector(sunDir, 4000);
        sunMesh.visible = sunVisible;
        godRays.blendMode.opacity.value = sunVisible ? 1 : 0;
      }
      if (dof) {
        dof.cocMaterial.worldFocusDistance = focusDist;
        dof.cocMaterial.worldFocusRange = aiming ? 25 : 120;
        dof.bokehScale = aiming ? 2.0 : 0.6;
      }
    },
    render(dt) { composer.render(dt); },
  };
}
