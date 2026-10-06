// Per-object motion vectors for motion blur.
//
// update(t) is a pure function of t, so the runtime can pose the scene at the
// moment the shutter opened: it calls update(t - T/2) (T = shutter time),
// remembers every object's world matrix, bone matrices, instance matrices and
// animated vertex positions, then calls update(t) and renders. Objects whose
// pose differs are drawn once more with a velocity material that projects
// both poses (current with three's own skinning/instancing/morph code,
// previous from the remembered data) and writes the screen-space motion.
// Everything else (static geometry, the sky) gets the camera's motion by
// re-projecting the depth buffer in the resolve pass - exact for static things.
// Chunk-warmup (simulation) scenes cannot go back in time; for them the
// previous FRAME is remembered instead (velocity scaled by the shutter angle).
import * as THREE from 'three';

export const VEL_LAYER = 29;

const VERT = /* glsl */ `
#include <common>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
uniform mat4 dkPrevModel;
uniform mat4 dkPrevViewProj;
uniform highp sampler2D dkPrevBones;
uniform int dkHasPrevBones;
uniform highp sampler2D dkPrevInst;
uniform int dkHasPrevInst;
uniform highp sampler2D dkPrevPos;
uniform int dkHasPrevPos;
uniform mat3 dkUvTransform;
varying vec4 vDkCur;
varying vec4 vDkPrev;
varying float vDkViewZ;
varying vec2 vDkUv;
#ifdef USE_SKINNING
mat4 dkPrevBone(const in float i) {
  int size = textureSize(dkPrevBones, 0).x;
  int j = int(i) * 4;
  int x = j % size, y = j / size;
  return mat4(texelFetch(dkPrevBones, ivec2(x, y), 0), texelFetch(dkPrevBones, ivec2(x + 1, y), 0),
              texelFetch(dkPrevBones, ivec2(x + 2, y), 0), texelFetch(dkPrevBones, ivec2(x + 3, y), 0));
}
#endif
mat4 dkPrevInstance() {
  int size = textureSize(dkPrevInst, 0).x;
  int j = gl_InstanceID * 4;
  int x = j % size, y = j / size;
  return mat4(texelFetch(dkPrevInst, ivec2(x, y), 0), texelFetch(dkPrevInst, ivec2(x + 1, y), 0),
              texelFetch(dkPrevInst, ivec2(x + 2, y), 0), texelFetch(dkPrevInst, ivec2(x + 3, y), 0));
}
void main() {
  vDkUv = (dkUvTransform * vec3(uv, 1.0)).xy;
  #include <skinbase_vertex>
  #include <begin_vertex>
  #include <morphtarget_vertex>
  vec3 prevLocal = transformed;
  if (dkHasPrevPos == 1) {
    int size = textureSize(dkPrevPos, 0).x;
    prevLocal = texelFetch(dkPrevPos, ivec2(gl_VertexID % size, gl_VertexID / size), 0).xyz;
  }
  #include <skinning_vertex>
  #ifdef USE_SKINNING
    vec4 pSkinV = bindMatrix * vec4(prevLocal, 1.0);
    vec4 pSk = vec4(0.0);
    if (dkHasPrevBones == 1) {
      pSk += dkPrevBone(skinIndex.x) * pSkinV * skinWeight.x;
      pSk += dkPrevBone(skinIndex.y) * pSkinV * skinWeight.y;
      pSk += dkPrevBone(skinIndex.z) * pSkinV * skinWeight.z;
      pSk += dkPrevBone(skinIndex.w) * pSkinV * skinWeight.w;
    } else {
      pSk += boneMatX * pSkinV * skinWeight.x;
      pSk += boneMatY * pSkinV * skinWeight.y;
      pSk += boneMatZ * pSkinV * skinWeight.z;
      pSk += boneMatW * pSkinV * skinWeight.w;
    }
    prevLocal = (bindMatrixInverse * pSk).xyz;
  #endif
  vec4 cur = vec4(transformed, 1.0);
  vec4 prv = vec4(prevLocal, 1.0);
  #ifdef USE_INSTANCING
    cur = instanceMatrix * cur;
    prv = (dkHasPrevInst == 1 ? dkPrevInstance() : instanceMatrix) * prv;
  #endif
  vec4 world = modelMatrix * cur;
  vec4 view = viewMatrix * world;
  vDkCur = projectionMatrix * view;
  vDkPrev = dkPrevViewProj * (dkPrevModel * prv);
  vDkViewZ = -view.z;
  gl_Position = vDkCur;
}`;

const FRAG = /* glsl */ `
uniform highp sampler2D dkSceneDepth;
uniform vec2 dkSize;
uniform float dkNear, dkFar, dkVelScale;
uniform sampler2D dkAlphaMap;
uniform float dkAlphaTest;
varying vec4 vDkCur;
varying vec4 vDkPrev;
varying float vDkViewZ;
varying vec2 vDkUv;
float dkViewZ(float d) { float z = d * 2.0 - 1.0; return 2.0 * dkNear * dkFar / ((dkFar + dkNear) - z * (dkFar - dkNear)); }
void main() {
  if (dkAlphaTest > 0.0 && texture2D(dkAlphaMap, vDkUv).a < dkAlphaTest) discard;
  float sz = dkViewZ(texelFetch(dkSceneDepth, ivec2(gl_FragCoord.xy), 0).r);
  if (vDkViewZ > sz * 1.01 + 0.05) discard;          // hidden behind something in the main picture
  vec2 a = vDkCur.xy / vDkCur.w;
  vec2 b = vDkPrev.xy / max(vDkPrev.w, 1e-6);
  vec2 vel = vDkPrev.w > 1e-6 ? (a - b) * 0.5 * dkSize * dkVelScale : vec2(0.0);
  gl_FragColor = vec4(vel, 0.0, 1.0);
}`;

// created on first use (a texture made at import time would shift three's UUID sequence for every scene)
let EMPTY_TEX = null;
function empty() {
  if (!EMPTY_TEX) { EMPTY_TEX = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType); EMPTY_TEX.needsUpdate = true; }
  return EMPTY_TEX;
}

function floatTexture(arr, texels) {
  const size = Math.max(4, Math.ceil(Math.sqrt(texels) / 4) * 4);
  const data = new Float32Array(size * size * 4);
  data.set(arr.subarray(0, Math.min(arr.length, data.length)));
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
  t.needsUpdate = true;
  return t;
}

export class VelocityTracker {
  constructor(host) {
    this.host = host;
    this.prev = new WeakMap();        // object -> snapshot
    this.prevViewProj = new THREE.Matrix4();
    this.hasPrev = false;
    this.mats = new WeakMap();        // object -> velocity material
    this.dynamic = [];
    this.velCam = null;
    this._m = new THREE.Matrix4();
  }

  /** Remember the pose of everything (after update() for the shutter-open time). */
  snapshot() {
    const { scene, camera } = this.host;
    scene.updateMatrixWorld();
    camera.updateMatrixWorld();
    this.prevViewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    scene.traverse((o) => {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry?.attributes?.position) return;
      let s = this.prev.get(o);
      if (!s) { s = { m: new Float32Array(16) }; this.prev.set(o, s); }
      s.m.set(o.matrixWorld.elements);
      s.visible = true;
      if (o.isSkinnedMesh && o.skeleton) {
        o.skeleton.update();
        const bm = o.skeleton.boneMatrices;
        if (!s.bones || s.bones.length !== bm.length) s.bones = new Float32Array(bm.length);
        s.bones.set(bm);
      }
      if (o.isInstancedMesh) {
        const a = o.instanceMatrix;
        s.instVer = a.version; s.instCount = o.count;
        if (s.instCopyVer !== a.version || !s.inst || s.inst.length !== a.array.length) {
          s.inst = (s.inst && s.inst.length === a.array.length) ? s.inst : new Float32Array(a.array.length);
          s.inst.set(a.array); s.instCopyVer = a.version;
          s.instTexDirty = true;
        }
      }
      const p = o.geometry.attributes.position;
      if (!p.isInterleavedBufferAttribute) {
        s.posVer = p.version;
        if (s.posCopyVer !== p.version || !s.pos || s.pos.length !== p.array.length) {
          s.pos = (s.pos && s.pos.length === p.array.length) ? s.pos : new Float32Array(p.array.length);
          s.pos.set(p.array); s.posCopyVer = p.version; s.posItem = p.itemSize; s.posTexDirty = true;
        }
      }
      s.morph = o.morphTargetInfluences ? o.morphTargetInfluences.slice() : null;
    });
    this.hasPrev = true;
  }

  /** After update(t): which objects moved since the snapshot? */
  collectDynamic() {
    this.dynamic = [];
    if (!this.hasPrev) return this.dynamic;
    const { scene } = this.host;
    scene.updateMatrixWorld();
    scene.traverseVisible((o) => {
      if (!(o.isMesh || o.isSkinnedMesh) || !o.geometry?.attributes?.position) return;
      const s = this.prev.get(o);
      if (!s || o.userData?.dkNoVelocity) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      if (mats.some((m) => !m || m.transparent || m.depthWrite === false || m.visible === false || m.colorWrite === false)) return;
      let moved = false;
      const e = o.matrixWorld.elements;
      for (let i = 0; i < 16; i++) if (e[i] !== s.m[i]) { moved = true; break; }
      const dyn = { o, s, bones: false, inst: false, pos: false };
      if (o.isSkinnedMesh && s.bones) {
        o.skeleton.update();
        const bm = o.skeleton.boneMatrices;
        for (let i = 0; i < bm.length; i++) if (bm[i] !== s.bones[i]) { dyn.bones = true; break; }
      }
      if (o.isInstancedMesh && s.inst && o.instanceMatrix.version !== s.instVer) {
        const a = o.instanceMatrix.array;
        for (let i = 0; i < a.length; i++) if (a[i] !== s.inst[i]) { dyn.inst = true; break; }
      }
      const p = o.geometry.attributes.position;
      if (s.pos && !p.isInterleavedBufferAttribute && p.version !== s.posVer && p.array.length === s.pos.length) {
        const a = p.array;
        for (let i = 0; i < a.length; i++) if (a[i] !== s.pos[i]) { dyn.pos = true; break; }
      }
      if (s.morph && o.morphTargetInfluences) {
        for (let i = 0; i < s.morph.length; i++) if (s.morph[i] !== o.morphTargetInfluences[i]) { moved = true; break; }
      }
      if (moved || dyn.bones || dyn.inst || dyn.pos) this.dynamic.push(dyn);
    });
    return this.dynamic;
  }

  materialFor(d) {
    let m = this.mats.get(d.o);
    if (!m) {
      m = new THREE.ShaderMaterial({
        name: 'DKVelocity',
        vertexShader: VERT, fragmentShader: FRAG,
        uniforms: {
          dkPrevModel: { value: new THREE.Matrix4() }, dkPrevViewProj: { value: new THREE.Matrix4() },
          dkPrevBones: { value: empty() }, dkHasPrevBones: { value: 0 },
          dkPrevInst: { value: empty() }, dkHasPrevInst: { value: 0 },
          dkPrevPos: { value: empty() }, dkHasPrevPos: { value: 0 },
          dkUvTransform: { value: new THREE.Matrix3() },
          dkSceneDepth: { value: null }, dkSize: { value: new THREE.Vector2() }, dkNear: { value: 0.1 }, dkFar: { value: 1000 }, dkVelScale: { value: 1 },
          dkAlphaMap: { value: empty() }, dkAlphaTest: { value: 0 },
        },
        fog: false, lights: false,
      });
      this.mats.set(d.o, m);
    }
    const u = m.uniforms, s = d.s, o = d.o;
    u.dkPrevModel.value.fromArray(s.m);
    u.dkPrevViewProj.value.copy(this.prevViewProj);
    const src = Array.isArray(o.material) ? o.material[0] : o.material;
    m.side = src.side;
    const amap = src.alphaTest > 0 ? (src.alphaMap || src.map) : null;
    u.dkAlphaTest.value = amap ? src.alphaTest : 0;
    u.dkAlphaMap.value = amap || empty();
    if (amap) { amap.updateMatrix(); u.dkUvTransform.value.copy(amap.matrix); } else u.dkUvTransform.value.identity();
    // previous bones / instances / vertices as float textures (only when they differ)
    if (d.bones) {
      const bt = o.skeleton.boneTexture;
      const size = bt ? bt.image.width : Math.max(4, Math.ceil(Math.sqrt(s.bones.length / 4) / 4) * 4);
      if (!s.boneTex || s.boneTex.image.width !== size) { s.boneTex?.dispose(); s.boneTex = new THREE.DataTexture(new Float32Array(size * size * 4), size, size, THREE.RGBAFormat, THREE.FloatType); }
      s.boneTex.image.data.fill(0); s.boneTex.image.data.set(s.bones); s.boneTex.needsUpdate = true;
      u.dkPrevBones.value = s.boneTex; u.dkHasPrevBones.value = 1;
    } else { u.dkPrevBones.value = empty(); u.dkHasPrevBones.value = 0; }
    if (d.inst) {
      if (s.instTexDirty || !s.instTex) { s.instTex?.dispose(); s.instTex = floatTexture(s.inst, s.inst.length / 4); s.instTexDirty = false; }
      u.dkPrevInst.value = s.instTex; u.dkHasPrevInst.value = 1;
    } else { u.dkPrevInst.value = empty(); u.dkHasPrevInst.value = 0; }
    if (d.pos) {
      if (s.posTexDirty || !s.posTex) {
        s.posTex?.dispose();
        const n = s.pos.length / s.posItem, rgba = new Float32Array(n * 4);
        for (let i = 0; i < n; i++) for (let k = 0; k < Math.min(3, s.posItem); k++) rgba[4 * i + k] = s.pos[s.posItem * i + k];
        s.posTex = floatTexture(rgba, n); s.posTexDirty = false;
      }
      u.dkPrevPos.value = s.posTex; u.dkHasPrevPos.value = 1;
    } else { u.dkPrevPos.value = empty(); u.dkHasPrevPos.value = 0; }
    return m;
  }

  /**
   * Draw the moving objects' motion vectors into target (cleared first).
   * sceneDepth: the main pass' depth texture (occlusion test in the shader).
   */
  render(target, { sceneDepth, width, height, velScale }) {
    const { renderer, scene, camera } = this.host;
    renderer.setRenderTarget(target);
    const cc = renderer.getClearColor(new THREE.Color()), ca = renderer.getClearAlpha();
    renderer.setClearColor(0x000000, 0);
    renderer.clear(true, true, false);
    renderer.setClearColor(cc, ca);
    if (!this.dynamic.length) return 0;
    if (!this.velCam) this.velCam = camera.clone();
    this.velCam.copy(camera, false);
    this.velCam.layers.set(VEL_LAYER);
    const swapped = [];
    for (const d of this.dynamic) {
      const m = this.materialFor(d);
      const u = m.uniforms;
      u.dkSceneDepth.value = sceneDepth; u.dkSize.value.set(width, height);
      u.dkNear.value = camera.near; u.dkFar.value = camera.far; u.dkVelScale.value = velScale;
      swapped.push([d.o, d.o.material, d.o.layers.mask]);
      d.o.material = Array.isArray(d.o.material) ? d.o.material.map(() => m) : m;
      d.o.layers.enable(VEL_LAYER);
    }
    const bg = scene.background, ov = scene.overrideMaterial, auto = renderer.shadowMap.autoUpdate, ac = renderer.autoClear;
    scene.background = null; scene.overrideMaterial = null; renderer.shadowMap.autoUpdate = false; renderer.autoClear = false;
    try { renderer.render(scene, this.velCam); }
    finally {
      scene.background = bg; scene.overrideMaterial = ov; renderer.shadowMap.autoUpdate = auto; renderer.autoClear = ac;
      for (const [o, mat, mask] of swapped) { o.material = mat; o.layers.mask = mask; }
    }
    return this.dynamic.length;
  }
}
