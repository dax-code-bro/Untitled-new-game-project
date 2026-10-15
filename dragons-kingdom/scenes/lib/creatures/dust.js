// Ground effects of a big dragon's take-off and landing (DESIGN 2.8: "his takeoff devastates the
// ground"), pure in t:
//   * downwash dust: every heavy downstroke near the ground blasts a ring of dust and dry grass
//     outward from under the wings (camera-facing alpha sprites, lit flat by the sky colour);
//   * thrown clods: turf and soil torn up by the kick and the vault, flying ballistic (small
//     lit instanced lumps that cast shadows);
//   * scars: the craters of the wrist pads and the claw furrows of the feet, dark torn soil.
//
//   const dust = createDust({ radius: 30, seed: 2 });
//   scene.add(dust.group);
//   dust.setScars([{ at: [x, z], r: 1.0, kind: 'crater' }, { at: [x, z], dir: [dx, dz], len: 3, kind: 'furrow' }]);
//   dust.update(t, { center: THREE.Vector3, bursts: [t0, t1, ...], kick: tk, kickPoints: [[x, z], ...] });
import * as THREE from 'three';

const fract = (x) => x - Math.floor(x);
const hash = (n, k = 0) => fract(Math.sin(n * 127.1 + k * 311.7 + 0.37) * 43758.5453);

const VERT = /* glsl */`
attribute vec4 aP;      // age 0..1, seed, size (m), alpha
varying vec2 vUv; varying vec4 vP;
void main() {
  vUv = uv; vP = aP;
  vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
  c.xy += position.xy * aP.z;
  gl_Position = projectionMatrix * c;
}`;
const FRAG = /* glsl */`
varying vec2 vUv; varying vec4 vP;
uniform vec3 uCol, uShade; uniform float uT;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }
void main() {
  vec2 q = vUv * 2.0 - 1.0;
  float sd = vP.y;
  vec2 np = q * 1.4 + vec2(sd * 13.0, sd * 7.0 + uT * 0.15);
  float n = vn(np) * 0.55 + vn(np * 2.2 + 3.1) * 0.3 + vn(np * 5.1 + 9.2) * 0.15;
  float m = smoothstep(1.0, 0.15, length(q) + (n - 0.5) * 0.9);
  float a = m * vP.w;
  if (a <= 0.004) discard;
  // the top of each puff catches the sky, the underside is in its own shadow
  vec3 col = mix(uShade, uCol, smoothstep(-0.8, 0.8, q.y + (n - 0.5) * 0.6));
  gl_FragColor = vec4(col * (0.85 + 0.3 * n), a);
}`;

/** createDust({ radius (m, how far the ring reaches), seed, color, puffs, clods }) */
export function createDust(opts = {}) {
  const R = opts.radius ?? 30;
  const seed = opts.seed ?? 1;
  const NP = opts.puffs ?? 1100, NC = opts.clods ?? 620;
  const col = opts.color ?? [0.42, 0.37, 0.29];
  const group = new THREE.Group();
  group.name = 'dragon-dust';
  const g = new THREE.PlaneGeometry(2, 2);
  const aP = new THREE.InstancedBufferAttribute(new Float32Array(NP * 4), 4);
  g.setAttribute('aP', aP);
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false,
    uniforms: { uCol: { value: new THREE.Vector3(...col) }, uShade: { value: new THREE.Vector3(col[0] * 0.45, col[1] * 0.45, col[2] * 0.5) }, uT: { value: 0 } },
  });
  const puffs = new THREE.InstancedMesh(g, mat, NP);
  puffs.frustumCulled = false; puffs.renderOrder = 4; puffs.userData.dkNoVelocity = true;
  group.add(puffs);
  // clods: irregular lumps of turf and soil (lit, shadow casting)
  const cg = new THREE.IcosahedronGeometry(1, 0);
  { const p = cg.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.7 + 0.6 * hash(i, 5); p.setXYZ(i, p.getX(i) * k, p.getY(i) * k * 0.7, p.getZ(i) * k); } cg.computeVertexNormals(); }
  const cm = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.06, 0.045, 0.03), roughness: 0.95 });
  const clods = new THREE.InstancedMesh(cg, cm, NC);
  clods.frustumCulled = false; clods.castShadow = true; clods.receiveShadow = true;
  group.add(clods);
  const scarGroup = new THREE.Group();
  group.add(scarGroup);
  const dummy = new THREE.Object3D();

  const api = {
    group,
    /** dark torn soil where the wrist pads and claws dug in: [{ at:[x,z], r, kind:'crater' } | { at, dir:[dx,dz], len, w, kind:'furrow' }] */
    setScars(list) {
      for (const c of [...scarGroup.children]) scarGroup.remove(c);
      const soil = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.036, 0.024), roughness: 0.97 });
      const rim = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.075, 0.07, 0.035), roughness: 0.95 });
      list.forEach((s, i) => {
        const n = 48;
        const geo = new THREE.CircleGeometry(1, n, 0, Math.PI * 2);
        const p = geo.attributes.position;
        for (let v = 1; v < p.count; v++) {
          const a = Math.atan2(p.getY(v), p.getX(v));
          const rr = 0.8 + 0.35 * hash(v + i * 97, 3) + 0.15 * Math.sin(a * 3 + i);
          p.setXY(v, p.getX(v) * rr, p.getY(v) * rr);
        }
        const m = new THREE.Mesh(geo, soil);
        m.rotation.x = -Math.PI / 2;
        m.receiveShadow = true;
        if (s.kind === 'furrow') {
          const d = new THREE.Vector2(s.dir[0], s.dir[1]).normalize();
          m.scale.set(s.len * 0.5, (s.w ?? 0.35), 1);
          m.rotation.z = Math.atan2(d.y, d.x);
          m.position.set(s.at[0] + d.x * s.len * 0.5, 0.012, s.at[1] + d.y * s.len * 0.5);
          // the turned soil heaped along the furrow's end
          const heap = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), rim);
          heap.scale.set((s.w ?? 0.35) * 1.6, (s.w ?? 0.35) * 0.9, (s.w ?? 0.35) * 1.4);
          heap.position.set(s.at[0] + d.x * s.len, 0.0, s.at[1] + d.y * s.len);
          heap.castShadow = heap.receiveShadow = true;
          scarGroup.add(heap);
        } else {
          m.scale.set(s.r, s.r, 1);
          m.position.set(s.at[0], 0.01, s.at[1]);
          // (rev. 2) the thrown-up rim stands out of the grass: heaped soil and torn turf slabs
          const lip = new THREE.Mesh(new THREE.TorusGeometry(1, 0.2, 8, 40), rim);
          lip.rotation.x = -Math.PI / 2;
          lip.scale.set(s.r * 1.12, s.r * 1.12, s.r * 1.6);
          lip.position.set(s.at[0], 0.02, s.at[1]);
          lip.castShadow = lip.receiveShadow = true;
          scarGroup.add(lip);
          for (let q = 0; q < 9; q++) {
            const a = (q / 9) * Math.PI * 2 + hash(q + i * 13, 8);
            const slab = new THREE.Mesh(new THREE.BoxGeometry(1, 0.25, 0.7), q % 3 ? soil : rim);
            const rr = s.r * (1.2 + 0.5 * hash(q + i * 13, 9));
            slab.scale.setScalar(s.r * (0.35 + 0.4 * hash(q + i * 13, 10)));
            slab.position.set(s.at[0] + Math.cos(a) * rr, s.r * 0.08, s.at[1] + Math.sin(a) * rr);
            slab.rotation.set((hash(q, 11) - 0.5) * 1.2, a, (hash(q, 12) - 0.5) * 1.0);
            slab.castShadow = slab.receiveShadow = true;
            scarGroup.add(slab);
          }
        }
        scarGroup.add(m);
      });
    },
    /**
     * Pure in t. o: { center (Vector3 on the ground under the wings), bursts: [downstroke times],
     * kick: time of the leg kick / vault, kickPoints: [[x, z], ...], lift: 0..1 (ground effect fades
     * as the dragon climbs), sky: [r,g,b] colour of the lit tops }
     */
    update(t, o = {}) {
      const C = o.center || new THREE.Vector3();
      mat.uniforms.uT.value = t;
      if (o.sky) mat.uniforms.uCol.value.set(...o.sky);
      const bursts = (o.bursts || []).filter((b) => b <= t);
      const per = Math.floor(NP / Math.max(1, (o.bursts || []).length));
      let k = 0;
      (o.bursts || []).forEach((tb, bi) => {
        const strength = (o.strength ?? 1) * Math.pow(0.82, bi) * (o.lift !== undefined ? 1 : 1);
        for (let j = 0; j < per && k < NP; j++, k++) {
          const h1 = hash(k + seed * 31, 1), h2 = hash(k + seed * 31, 2), h3 = hash(k + seed * 31, 3), h4 = hash(k + seed * 31, 4);
          const age = t - tb - h4 * 0.25;
          if (age <= 0 || !bursts.includes(tb)) { aP.setXYZW(k, 0, h1, 0, 0); dummy.position.set(0, -1e4, 0); dummy.updateMatrix(); puffs.setMatrixAt(k, dummy.matrix); continue; }
          const life = 3.5 + 3 * h3;
          const f = Math.min(1, age / life);
          // the ring races out and slows (radial wall jet), rolls up and rises a little
          const ang = h1 * Math.PI * 2;
          const r0 = R * 0.12 * (0.3 + h2);
          const r = r0 + R * (0.9 + 0.5 * h2) * (1 - Math.exp(-2.6 * age / 2.2)) * strength;
          // the wall jet rolls up into a dome: puffs further out climb higher and swell
          const y = (0.6 + 2.2 * h3) * (R / 30) * (0.3 + age * 0.6) * (1 - 0.3 * f) + (r / R) * (R / 30) * 3.5 * h3 * Math.min(1, age / 3);
          dummy.position.set(C.x + Math.cos(ang) * r, C.y + y, C.z + Math.sin(ang) * r);
          dummy.updateMatrix();
          puffs.setMatrixAt(k, dummy.matrix);
          const size = (R / 30) * (1.2 + 3.5 * h2) * (0.4 + 1.6 * Math.sqrt(age / 2));
          const alpha = 0.62 * strength * Math.min(1, age * 4) * (1 - f) * (1 - f);
          aP.setXYZW(k, f, h1, size, alpha);
        }
      });
      for (; k < NP; k++) { aP.setXYZW(k, 0, 0, 0, 0); dummy.position.set(0, -1e4, 0); dummy.updateMatrix(); puffs.setMatrixAt(k, dummy.matrix); }
      puffs.instanceMatrix.needsUpdate = true; aP.needsUpdate = true;
      // clods from the kick points: ballistic with a little drag, tumbling, lying where they land
      const pts = o.kickPoints || [];
      for (let i = 0; i < NC; i++) {
        const h1 = hash(i + seed * 71, 1), h2 = hash(i + seed * 71, 2), h3 = hash(i + seed * 71, 3), h4 = hash(i + seed * 71, 4);
        const kp = pts.length ? pts[i % pts.length] : [C.x, C.z];
        const age = o.kick !== undefined ? t - o.kick - h4 * 0.3 : -1;
        if (age <= 0) { dummy.position.set(0, -1e4, 0); dummy.scale.setScalar(0.001); dummy.updateMatrix(); clods.setMatrixAt(i, dummy.matrix); continue; }
        // (rev. 2) sizes from a power law - a spray of crumbs and grass roots, some fist-sized
        // clods, a few torn slabs of turf a metre across - thrown on arcs of different heights;
        // the big ones fly lower and land nearer, then skid
        const big = Math.pow(h3, 5);
        const sc = (0.025 + 0.95 * big + 0.08 * h3 * h3) * Math.sqrt(R / 30);
        const ang = h1 * Math.PI * 2 + (hash(i + seed * 71, 6) - 0.5) * 0.4;
        const v = (5 + 17 * h2 * (1 - 0.6 * big)) * Math.sqrt(R / 30);
        const vy = (2.5 + 14 * hash(i + seed * 71, 5) * (1 - 0.7 * big)) * Math.sqrt(R / 30);
        const tFly = (2 * vy) / 9.81;
        const tf = Math.min(age, tFly);
        const skid = Math.max(0, age - tFly);
        const sd = v * 0.3 * (1 - Math.exp(-3 * skid));
        const x = kp[0] + Math.cos(ang) * (v * tf * 0.85 + sd), z = kp[1] + Math.sin(ang) * (v * tf * 0.85 + sd);
        const y = Math.max(sc * 0.35, vy * tf - 0.5 * 9.81 * tf * tf);
        dummy.position.set(x, y, z);
        const spin = age < tFly ? age : tFly + 0.3 * (1 - Math.exp(-3 * skid));
        dummy.rotation.set(spin * 7 * h1, spin * 5 * h2, spin * 3);
        dummy.scale.set(sc * (0.8 + 0.5 * h1), sc * (big > 0.2 ? 0.35 : 0.7), sc * (0.8 + 0.5 * h2));
        dummy.updateMatrix();
        clods.setMatrixAt(i, dummy.matrix);
      }
      clods.instanceMatrix.needsUpdate = true;
    },
  };
  return api;
}
