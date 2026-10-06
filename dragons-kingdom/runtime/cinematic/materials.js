// Patches three.js' built-in lit materials (Standard, Physical, Lambert, Phong,
// Toon) for the cinematic stack - per material, through onBeforeCompile
// (chained after any patch the scene made itself, e.g. dk/atmosphere fog):
//
//  * screen-space ambient occlusion (GTAO) multiplies ONLY the indirect light
//    (sky / ambient / environment), with Jimenez' multi-bounce fit and three's
//    specular occlusion - direct sunlight is not darkened (no "SSAO halo" look)
//  * contact shadows and cloud shadows multiply ONLY the sun
//  * cascaded shadow maps: the sun is N DirectionalLights (one shadow map
//    each); each fragment uses the cascade that covers its distance, with a
//    linear cross-fade between cascades, and skips the others' lighting.
//
// The sun light(s) must be the first shadow-casting DirectionalLight(s) in the
// scene (the runtime moves them to the front of their parent when needed).
import * as THREE from 'three';
import { FAST_IBL_GLSL } from './envbake.js';

const DECL = /* glsl */ `
#ifdef DK_FASTIBL
${FAST_IBL_GLSL}
#endif
uniform sampler2D dkAOTex;        // half-res: r = ambient visibility, g = contact-shadow visibility
uniform vec2 dkScreenInv;         // 1 / render size
uniform float dkAOStrength;
uniform float dkContactStrength;
uniform mat4 dkViewInverse;
uniform vec4 dkCsmBand[4];        // per cascade: fade-in start/end, fade-out start/end (view z)
uniform float dkCsmFadeEnd;
uniform sampler2D dkCloudTex;
uniform vec4 dkCloud;             // coverage, softness, opacity, altitude
uniform vec4 dkCloudXf;           // scale, offset x, offset z, enabled
uniform vec3 dkSunDirW;
float dkCloudShadowAt(vec3 wp) {
  if (dkCloudXf.w < 0.5 || dkSunDirW.y <= 0.01) return 1.0;
  vec2 p = wp.xz + dkSunDirW.xz / dkSunDirW.y * (dkCloud.w - wp.y);
  vec2 uv = p * dkCloudXf.x + dkCloudXf.yz;
  float n = texture2D(dkCloudTex, uv).r * 0.7 + texture2D(dkCloudTex, uv * 3.1 + 0.37).r * 0.3;
  float cov = smoothstep(1.0 - dkCloud.x - dkCloud.y, 1.0 - dkCloud.x + dkCloud.y, n);
  return 1.0 - cov * dkCloud.z;
}
vec3 dkMultiBounce(float v, vec3 albedo) {
  vec3 a = 2.0404 * albedo - 0.3324, b = -4.7951 * albedo + 0.6417, c = 2.7552 * albedo + 0.6903;
  return max(vec3(v), ((v * a + b) * v + c) * v);
}
float dkCascadeWeight(int i, float z) {   // z: vViewPosition.z (declared after <common> by some materials)
#ifdef DK_CSM
  if (i >= DK_CSM) return 1.0;
  vec4 b = dkCsmBand[i];
  float win = b.y > b.x ? clamp((z - b.x) / (b.y - b.x), 0.0, 1.0) : 1.0;
  float wout = b.w > b.z ? 1.0 - clamp((z - b.z) / (b.w - b.z), 0.0, 1.0) : 1.0;
  return win * wout;
#else
  return 1.0;
#endif
}
float dkSunExtra(int i, vec3 wp, vec2 aoS) {
  if (i >= DK_SUN_LIGHTS) return 1.0;
  float s = 1.0;
#ifdef DK_CONTACT
  s *= mix(1.0, aoS.g, dkContactStrength);
#endif
#ifdef DK_CLOUDS
  s *= dkCloudShadowAt(wp);
#endif
  return s;
}
`;

// lights_fragment_begin with the directional loop replaced
function patchedLightsBegin() {
  const src = THREE.ShaderChunk.lights_fragment_begin;
  const a = src.indexOf('#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )');
  const b = src.indexOf('#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )');
  if (a < 0 || b < 0) throw new Error('[dk] cinematic: three.js lights_fragment_begin changed - cannot patch');
  const loop = /* glsl */ `
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	vec3 dkWorldPos = ( dkViewInverse * vec4( - vViewPosition, 1.0 ) ).xyz;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		// (three unrolls this loop by pasting the body N times: an inner block keeps the locals apart)
		{
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		float dkW = dkCascadeWeight( UNROLLED_LOOP_INDEX, vViewPosition.z );
		if ( dkW > 0.0 ) {
			#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
			directionalLightShadow = directionalLightShadows[ i ];
			float dkSh = ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
			#ifdef DK_CSM
			if ( UNROLLED_LOOP_INDEX < DK_CSM ) dkSh = mix( dkSh, 1.0, clamp( ( vViewPosition.z - dkCsmFadeEnd * 0.9 ) / ( dkCsmFadeEnd * 0.1 ), 0.0, 1.0 ) );
			#endif
			directLight.color *= dkSh;
			#endif
			directLight.color *= dkW * dkSunExtra( UNROLLED_LOOP_INDEX, dkWorldPos, dkAoS );
			RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
		}
		}
	}
	#pragma unroll_loop_end
#endif
`;
  return src.slice(0, a) + loop + src.slice(b);
}

const AO_BLOCK = /* glsl */ `
#ifdef DK_SSAO
{
	float dkAo = mix( 1.0, dkAoS.r, dkAOStrength );
	reflectedLight.indirectDiffuse *= dkMultiBounce( dkAo, diffuseColor.rgb );
	#if defined( USE_ENVMAP ) && defined( STANDARD )
	float dkNV = saturate( dot( geometryNormal, geometryViewDir ) );
	reflectedLight.indirectSpecular *= computeSpecularOcclusion( dkNV, dkAo, material.roughness );
	#endif
}
#endif
`;

// after envmap_physical_pars_fragment (three's envMap uniforms exist from there on)
const FAST_IBL_FN = /* glsl */ `
#if defined( DK_FASTIBL ) && defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
vec3 dkFastIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
	vec3 r = reflect( - viewDir, normal );
	r = normalize( mix( r, normal, roughness * roughness ) );
	r = inverseTransformDirection( r, viewMatrix );
	return dkEnvRadiance( envMapRotation * r, roughness ) * envMapIntensity;
}
vec3 dkFastIBLIrradiance( const in vec3 normal ) {
	return dkSHIrr( envMapRotation * inverseTransformDirection( normal, viewMatrix ) ) * envMapIntensity;
}
#endif
`;
function fastLightsMaps() {
  const src = THREE.ShaderChunk.lights_fragment_maps;
  const a = 'iblIrradiance += getIBLIrradiance( geometryNormal );';
  const b = 'radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );';
  if (!src.includes(a) || !src.includes(b)) throw new Error('[dk] cinematic: three.js lights_fragment_maps changed - cannot patch the fast IBL');
  return src
    .replace(a, '#ifdef DK_FASTIBL\n\t\tiblIrradiance += dkFastIBLIrradiance( geometryNormal );\n\t#else\n\t\t' + a + '\n\t#endif')
    .replace(b, '#ifdef DK_FASTIBL\n\t\tradiance += dkFastIBLRadiance( geometryViewDir, geometryNormal, material.roughness );\n\t#else\n\t\t' + b + '\n\t#endif');
}

const isLit = (m) => m && (m.isMeshStandardMaterial || m.isMeshLambertMaterial || m.isMeshPhongMaterial || m.isMeshToonMaterial) && !m.isShaderMaterial;

export class MaterialPatcher {
  constructor() {
    this.uniforms = {
      dkAOTex: { value: null }, dkScreenInv: { value: new THREE.Vector2(1, 1) },
      dkAOStrength: { value: 1 }, dkContactStrength: { value: 1 },
      dkViewInverse: { value: new THREE.Matrix4() },
      dkCsmBand: { value: [new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4(), new THREE.Vector4()] },
      dkCsmFadeEnd: { value: 1e9 },
      dkCloudTex: { value: null }, dkCloud: { value: new THREE.Vector4(0.5, 0.2, 0.8, 1500) }, dkCloudXf: { value: new THREE.Vector4(0.001, 0, 0, 0) },
      dkSunDirW: { value: new THREE.Vector3(0, 1, 0) },
      dkSH: { value: Array.from({ length: 9 }, () => new THREE.Vector3()) },
      dkEnvEq: { value: null }, dkEnvEqMaxLod: { value: 10 },
    };
    this.defines = { DK_SUN_LIGHTS: 1 };
    this.patched = new WeakSet();
    this.lightsBegin = patchedLightsBegin();
    this.lightsMaps = fastLightsMaps();
  }

  /** Feature switches (fixed for the run; part of every patched program's cache key). */
  configure({ ssao, contact, csm, clouds, sunLights, fastIBL }) {
    const d = { DK_SUN_LIGHTS: sunLights || 1 };
    if (fastIBL) d.DK_FASTIBL = 1;
    if (ssao) d.DK_SSAO = 1;
    if (contact) d.DK_CONTACT = 1;
    if (csm) d.DK_CSM = csm;
    if (clouds) d.DK_CLOUDS = 1;
    this.defines = d;
    this.key = JSON.stringify(d);
  }

  patch(m) {
    if (!isLit(m) || this.patched.has(m)) return false;
    this.patched.add(m);
    const self = this;
    const prev = m.onBeforeCompile;
    m.onBeforeCompile = function dkCinematicPatch(shader, renderer) {
      if (prev && prev !== dkCinematicPatch) prev.call(this, shader, renderer);
      Object.assign(shader.uniforms, self.uniforms);
      const d = { ...self.defines };
      if (m.userData.dkNoSSAO) { delete d.DK_SSAO; delete d.DK_CONTACT; }
      if (m.envMap) delete d.DK_FASTIBL;          // its own environment: keep three's lookup
      shader.defines = { ...(shader.defines || {}), ...d };
      let fs = shader.fragmentShader;
      fs = fs.replace('#include <common>', '#include <common>\n' + DECL);
      // the AO/contact texture is read once per fragment, before the lights
      fs = fs.replace('#include <lights_fragment_begin>', '#if defined( DK_SSAO ) || defined( DK_CONTACT )\nvec2 dkAoS = texture2D( dkAOTex, gl_FragCoord.xy * dkScreenInv ).rg;\n#else\nvec2 dkAoS = vec2( 1.0 );\n#endif\n' + self.lightsBegin);
      fs = fs.replace('#include <aomap_fragment>', '#include <aomap_fragment>\n' + AO_BLOCK);
      fs = fs.replace('#include <envmap_physical_pars_fragment>', '#include <envmap_physical_pars_fragment>\n' + FAST_IBL_FN);
      fs = fs.replace('#include <lights_fragment_maps>', self.lightsMaps);
      shader.fragmentShader = fs;
    };
    const prevKey = m.customProgramCacheKey;
    m.customProgramCacheKey = function () { return (prevKey ? prevKey.call(this) : '') + '|dkcin' + self.key + (m.userData.dkNoSSAO ? '-noao' : '') + (m.envMap ? '-ownenv' : ''); };
    m.needsUpdate = true;
    return true;
  }

  /** Patch every lit material in the scene (cheap after the first call: a WeakSet lookup per material). */
  patchScene(scene) {
    let n = 0;
    scene.traverse((o) => {
      if (!o.material) return;
      for (const m of Array.isArray(o.material) ? o.material : [o.material]) if (this.patch(m)) n++;
    });
    return n;
  }
}
