// Tracks in soft ground: boot prints, hoof and paw prints, tyre tracks.
// Each kind is one instanced mesh of small decals pressed into the ground (an alpha shape plus a
// normal map, so the edge of the print catches the light). They're laid where the ground is soft
// (sand, dirt, grass, forest litter), deeper in wet sand and mud, and they fade: in a few minutes,
// faster in the rain. You can follow an animal's prints, or your own back.
import * as THREE from 'three';
import { scanGround } from '../core/substrate.js';
import { worldUniforms } from './terrain.js';

const SOFT = { sand: 1, soil: 0.85, grass: 0.45, litter: 0.55 };
const LIFE = 240; // seconds, dry

// a print as a height field on a canvas -> an alpha map and a normal map
function printTex(draw, w = 64, h = 128) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#fff'; g.filter = 'blur(1.5px)';
  draw(g, w, h);
  const img = g.getImageData(0, 0, w, h).data;
  const alpha = new THREE.CanvasTexture(c);
  // normals from the height (a print is a dent: the walls face inwards)
  const n = document.createElement('canvas'); n.width = w; n.height = h;
  const ng = n.getContext('2d'), out = ng.createImageData(w, h);
  const H = (x, y) => img[(Math.min(h - 1, Math.max(0, y)) * w + Math.min(w - 1, Math.max(0, x))) * 4] / 255;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const dx = (H(x + 1, y) - H(x - 1, y)) * 2.2, dy = (H(x, y + 1) - H(x, y - 1)) * 2.2;
    const L = Math.hypot(dx, dy, 1), k = (y * w + x) * 4;
    out.data[k] = (dx / L * 0.5 + 0.5) * 255; out.data[k + 1] = (-dy / L * 0.5 + 0.5) * 255; out.data[k + 2] = (1 / L * 0.5 + 0.5) * 255; out.data[k + 3] = 255;
  }
  ng.putImageData(out, 0, 0);
  const normal = new THREE.CanvasTexture(n);
  alpha.colorSpace = THREE.NoColorSpace; normal.colorSpace = THREE.NoColorSpace;
  return { alpha, normal };
}

const SHAPES = {
  boot: (g, w, h) => { // sole and heel, with lugs
    g.beginPath(); g.ellipse(w / 2, h * 0.3, w * 0.33, h * 0.22, 0, 0, 6.283); g.fill();
    g.beginPath(); g.ellipse(w / 2, h * 0.76, w * 0.26, h * 0.14, 0, 0, 6.283); g.fill();
    g.fillStyle = '#7a7a7a';
    for (let i = 0; i < 5; i++) g.fillRect(w * 0.24, h * (0.15 + i * 0.065), w * 0.52, h * 0.025);
    for (let i = 0; i < 3; i++) g.fillRect(w * 0.3, h * (0.7 + i * 0.05), w * 0.4, h * 0.02);
  },
  hoof: (g, w, h) => { // a cloven hoof
    for (const s of [-1, 1]) { g.beginPath(); g.ellipse(w / 2 + s * w * 0.15, h * 0.5, w * 0.13, h * 0.32, s * 0.12, 0, 6.283); g.fill(); }
  },
  paw: (g, w, h) => { // pad and four toes
    g.beginPath(); g.ellipse(w / 2, h * 0.66, w * 0.24, h * 0.16, 0, 0, 6.283); g.fill();
    for (const [x, y] of [[-0.2, 0.36], [-0.07, 0.24], [0.07, 0.24], [0.2, 0.36]]) { g.beginPath(); g.ellipse(w / 2 + x * w, h * y, w * 0.09, h * 0.08, 0, 0, 6.283); g.fill(); }
  },
  tread: (g, w, h) => { // a tyre's tread: a band of blocks
    g.fillRect(w * 0.08, 0, w * 0.84, h);
    g.fillStyle = '#6a6a6a';
    for (let i = 0; i < 8; i++) { g.fillRect(w * 0.12, h * (i / 8), w * 0.32, h * 0.05); g.fillRect(w * 0.56, h * (i / 8 + 0.06), w * 0.32, h * 0.05); }
  },
};

export function createTracks(scene, hm, opts = {}) {
  const N = opts.count || 700;
  const kinds = {};
  const _m = new THREE.Matrix4(), _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _n = new THREE.Vector3(), Y = new THREE.Vector3(0, 1, 0), _c = new THREE.Color();
  for (const [k, draw] of Object.entries(SHAPES)) {
    const tex = printTex(draw, 64, k === 'tread' ? 64 : 128);
    if (k === 'tread') { tex.alpha.wrapT = tex.normal.wrapT = THREE.RepeatWrapping; }
    const mat = new THREE.MeshStandardMaterial({ color: 0x2c2218, roughness: 0.95, transparent: true, depthWrite: false, alphaMap: tex.alpha, normalMap: tex.normal, normalScale: new THREE.Vector2(1.4, 1.4), polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    // the instance colour's red channel is how fresh the print is (fades its opacity, not its colour)
    mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#ifdef USE_INSTANCING_COLOR\n diffuseColor.a *= vColor.r;\n#endif'); };
    mat.customProgramCacheKey = () => 'sbtrack';
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mesh = new THREE.InstancedMesh(geo, mat, N);
    mesh.count = 0; mesh.frustumCulled = false; mesh.userData.noHit = true; mesh.userData.noReflect = true; mesh.receiveShadow = true;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 3), 3);
    scene.add(mesh);
    kinds[k] = { mesh, head: 0, born: new Float32Array(N).fill(-1e9), depth: new Float32Array(N), n: 0 };
  }
  const SIZE = { boot: [0.13, 0.3], hoof: [0.09, 0.12], paw: [0.08, 0.1], tread: [0.24, 0.42] };
  let t = 0;

  // press a print into the ground at (x, z) facing heading; returns false on hard ground
  const press = (kind, x, z, heading, scale = 1) => {
    const g = scanGround(x, z).sub?.id;
    const soft = SOFT[g];
    if (!soft) return false;
    const K = kinds[kind], i = K.head;
    K.head = (K.head + 1) % N; K.n = Math.min(N, K.n + 1);
    const [w, l] = SIZE[kind];
    hm.normal(x, z, _n);
    _q.setFromUnitVectors(Y, _n).multiply(new THREE.Quaternion().setFromAxisAngle(Y, heading));
    _m.compose(_p.set(x, hm.height(x, z) + 0.02, z), _q, _s.set(w * scale, 1, l * scale));
    K.mesh.setMatrixAt(i, _m); K.mesh.instanceMatrix.needsUpdate = true;
    // deeper in wet sand and mud
    K.depth[i] = Math.min(1, soft * (0.7 + worldUniforms.uWet.value * 0.5));
    K.born[i] = t;
    K.mesh.count = K.n;
    return true;
  };

  let fadeT = 0;
  return {
    kinds, press,
    count(kind) { const K = kinds[kind]; let n = 0; for (let i = 0; i < K.n; i++) if (t - K.born[i] < LIFE) n++; return n; },
    update(dt) {
      t += dt;
      if ((fadeT -= dt) > 0) return;
      fadeT = 0.5;
      // the rain smooths them over faster
      const life = LIFE * (1 - worldUniforms.uRain.value * 0.75);
      for (const K of Object.values(kinds)) {
        if (!K.n) continue;
        const col = K.mesh.instanceColor;
        for (let i = 0; i < K.n; i++) {
          const age = t - K.born[i];
          const a = age > life ? 0 : K.depth[i] * (1 - Math.max(0, age - life * 0.5) / (life * 0.5)) * 0.85;
          col.setXYZ(i, a, a, a);
        }
        col.needsUpdate = true;
      }
    },
  };
}
