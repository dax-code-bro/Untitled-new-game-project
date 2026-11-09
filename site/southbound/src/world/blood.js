// Blood on the ground and on walls (G13): spatter thrown behind someone who's shot (on the ground,
// and on a wall if one is right behind them), a pool that spreads under the badly hurt and the dead,
// drops in a trail behind the bleeding, smears where someone was hit by a car. Fresh blood is wet and
// bright; it darkens and dulls as it dries; rain thins it. 4 draw calls in all (one instanced mesh
// per kind), the oldest marks give way to new ones.
import * as THREE from 'three';

const KINDS = ['spatter', 'drops', 'pool', 'smear'];
const CAP = { spatter: 140, drops: 220, pool: 40, smear: 40 };
const UP = new THREE.Vector3(0, 1, 0);

// a 2x2 atlas of blood shapes, drawn once: alpha is the shape (white = blood)
function atlas() {
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
  let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const blob = (x, y, r, a = 1) => { const gr = g.createRadialGradient(x, y, r * 0.3, x, y, r); gr.addColorStop(0, `rgba(255,255,255,${a})`); gr.addColorStop(0.75, `rgba(255,255,255,${a * 0.85})`); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  // spatter (0,0): a splash thrown one way, droplets flung further, streaks
  g.save(); g.translate(128, 128);
  blob(-30, 0, 34); blob(-10, 6, 24);
  for (let i = 0; i < 46; i++) { const a = (rnd() - 0.5) * 1.6, d = 20 + rnd() * 95; blob(Math.cos(a) * d - 30, Math.sin(a) * d, 2 + rnd() * (d < 60 ? 9 : 5), 0.9); }
  for (let i = 0; i < 9; i++) { const a = (rnd() - 0.5) * 1.2; g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 2 + rnd() * 3; g.beginPath(); g.moveTo(-20, 0); g.lineTo(Math.cos(a) * (60 + rnd() * 50) - 20, Math.sin(a) * (60 + rnd() * 50)); g.stroke(); }
  g.restore();
  // drops (1,0): a few round drops
  g.save(); g.translate(384, 128);
  for (let i = 0; i < 7; i++) blob((rnd() - 0.5) * 120, (rnd() - 0.5) * 120, 5 + rnd() * 12);
  g.restore();
  // pool (0,1): an irregular pool with a soft rim
  g.save(); g.translate(128, 384);
  for (let i = 0; i < 22; i++) { const a = rnd() * 6.28, d = rnd() * 50; blob(Math.cos(a) * d, Math.sin(a) * d, 40 + rnd() * 40); }
  g.restore();
  // smear (1,1): dragged along
  g.save(); g.translate(384, 384);
  for (let i = 0; i < 30; i++) { const x = -100 + i * 7, w = 18 + Math.sin(i * 0.7) * 6 + rnd() * 6; blob(x, (rnd() - 0.5) * 10, w, 0.75); }
  g.restore();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.NoColorSpace; t.anisotropy = 4;
  return t;
}

export function createBlood(scene, collision) {
  const tex = atlas();
  const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, alphaMap: tex, transparent: true, depthWrite: false, roughness: 0.32, metalness: 0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  mat.name = 'blood';
  const meshes = {}, next = {}, life = {};
  KINDS.forEach((k, i) => {
    const geo = new THREE.PlaneGeometry(1, 1); geo.rotateX(-Math.PI / 2);
    const uv = geo.attributes.uv, ox = (i % 2) * 0.5, oy = 0.5 - Math.floor(i / 2) * 0.5; // (canvas y is down, uv v is up)
    for (let j = 0; j < uv.count; j++) uv.setXY(j, ox + uv.getX(j) * 0.5, oy + uv.getY(j) * 0.5);
    const m = new THREE.InstancedMesh(geo, mat, CAP[k]);
    m.name = 'blood-' + k; m.frustumCulled = false; m.count = 0; m.renderOrder = 1; m.receiveShadow = true;
    m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP[k] * 3), 3);
    scene.add(m); meshes[k] = m; next[k] = 0; life[k] = [];
  });
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();
  const FRESH = new THREE.Color(0.26, 0.008, 0.006), DRY = new THREE.Color(0.11, 0.018, 0.014); // (real blood is darker than paint)
  const growing = [];

  // put one mark down: at p, facing n (the ground or a wall), turned by `spin`, this big
  function mark(kind, p, n = UP, size = 1, spin = Math.random() * 6.28, stretch = 1) {
    const M = meshes[kind], i = next[kind];
    next[kind] = (i + 1) % CAP[kind];
    if (M.count < CAP[kind]) M.count++;
    _q.setFromUnitVectors(UP, n); _q2.setFromAxisAngle(UP, spin); _q.multiply(_q2);
    _s.set(size * stretch, 1, size);
    _p.copy(p).addScaledVector(n, 0.015);
    _m.compose(_p, _q, _s); M.setMatrixAt(i, _m); M.instanceMatrix.needsUpdate = true;
    M.setColorAt(i, FRESH); M.instanceColor.needsUpdate = true;
    life[kind][i] = { age: 0, p: _p.clone(), n: n.clone(), spin, size, stretch };
    return i;
  }
  const ground = (x, z, y) => new THREE.Vector3(x, collision.surface(x, z, y + 0.6), z);

  return {
    meshes,
    // shot: spatter thrown behind them on the ground, and on a wall if one is close behind
    spatter(point, dir, amount = 1) {
      const d = dir ? dir.clone().setY(0) : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
      if (d.lengthSq() < 1e-6) d.set(1, 0, 0);
      d.normalize();
      const reach = 0.6 + Math.random() * 1.2;
      const gp = ground(point.x + d.x * reach, point.z + d.z * reach, point.y);
      if (Math.abs(gp.y - point.y) < 3) mark('spatter', gp, UP, (0.7 + Math.random() * 0.6) * amount, Math.atan2(-d.z, d.x));
      // a wall right behind: blood on it at the height it was thrown
      const far = point.clone().addScaledVector(dir || d, 2.4);
      const t = collision.raycast(point.x, point.y, point.z, far.x, far.y, far.z);
      if (t < 1) {
        const hit = point.clone().lerp(far, t);
        const nrm = (dir || d).clone().negate().setY(0).normalize();
        mark('spatter', hit, nrm, (0.45 + Math.random() * 0.35) * amount, Math.random() * 6.28);
      }
    },
    // a pool spreading under someone down (grows over `secs`)
    pool(at, maxSize = 1.1, secs = 25) {
      const gp = ground(at.x, at.z, at.y + 0.3);
      const i = mark('pool', gp, UP, 0.15);
      growing.push({ i, t: 0, secs, maxSize: maxSize * (0.8 + Math.random() * 0.4) });
    },
    drop(at, size = 0.22) { mark('drops', ground(at.x + (Math.random() - 0.5) * 0.2, at.z + (Math.random() - 0.5) * 0.2, at.y), UP, size * (0.7 + Math.random() * 0.6)); },
    smear(at, dir, len = 1.8) {
      const d = dir ? dir.clone().setY(0).normalize() : new THREE.Vector3(1, 0, 0);
      mark('smear', ground(at.x, at.z, at.y), UP, 0.45, Math.atan2(-d.z, d.x), len / 0.45);
    },
    count() { let n = 0; for (const k of KINDS) n += meshes[k].count; return n; },
    clear() { for (const k of KINDS) { meshes[k].count = 0; next[k] = 0; life[k] = []; } growing.length = 0; },
    setVisible(v) { for (const k of KINDS) meshes[k].visible = v; },
    // pools spread; blood dries (darker, duller) over a few minutes; rain thins it
    update(dt, rain = 0) {
      for (let g = growing.length - 1; g >= 0; g--) {
        const G = growing[g]; G.t += dt;
        const L = life.pool[G.i]; if (!L) { growing.splice(g, 1); continue; }
        const k = Math.min(1, G.t / G.secs), size = 0.15 + (G.maxSize - 0.15) * (1 - (1 - k) * (1 - k));
        _q.setFromUnitVectors(UP, L.n); _q2.setFromAxisAngle(UP, L.spin); _q.multiply(_q2);
        _m.compose(L.p, _q, _s.set(size, 1, size)); meshes.pool.setMatrixAt(G.i, _m); meshes.pool.instanceMatrix.needsUpdate = true;
        if (k >= 1) growing.splice(g, 1);
      }
      this._t = (this._t || 0) + dt;
      if (this._t < 1) return; // colours once a second
      const step = this._t; this._t = 0;
      const c = new THREE.Color();
      for (const k of KINDS) {
        const M = meshes[k]; let ch = false;
        for (let i = 0; i < M.count; i++) {
          const L = life[k][i]; if (!L) continue;
          L.age += step * (1 + rain * 3);
          const dry = Math.min(1, L.age / 240);
          c.copy(FRESH).lerp(DRY, dry); if (rain > 0) c.multiplyScalar(Math.max(0.35, 1 - L.age / 1800));
          M.setColorAt(i, c); ch = true;
        }
        if (ch) M.instanceColor.needsUpdate = true;
      }
    },
  };
}
