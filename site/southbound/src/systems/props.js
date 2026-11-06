// Loose things on the street that move when you hit them: traffic cones,
// trash cans, newspaper boxes, crates, barrels and plastic chairs on the
// sidewalks of Port Calvera and Mill Creek. Cars send them flying, you can
// kick them over, bullets knock them around and explosions scatter them. They
// tumble, bounce and settle with simple rigid-body physics, and the city puts
// them back where they belong once you're well away.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, TOWN } from '../world/layout.js';

const paint = (g, hex) => {
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g.index ? g.toNonIndexed() : g;
};
const merge = (parts) => mergeGeometries(parts.map((p) => { const g = p.index ? p.toNonIndexed() : p; g.deleteAttribute('uv'); return g; }));

// geometry (origin on the ground), collision radius, half height, mass (kg)
const TYPES = {
  cone: () => ({ g: merge([
    paint(new THREE.ConeGeometry(0.15, 0.62, 14, 1, true).translate(0, 0.35, 0), 0xff5a10),
    paint(new THREE.CylinderGeometry(0.105, 0.125, 0.09, 14, 1, true).translate(0, 0.36, 0).scale(1.02, 1, 1.02), 0xf2f2f2),
    paint(new THREE.BoxGeometry(0.38, 0.04, 0.38).translate(0, 0.02, 0), 0x1a1a1a),
  ]), r: 0.2, h: 0.33, m: 3 }),
  can: () => ({ g: merge([
    paint(new THREE.CylinderGeometry(0.28, 0.25, 0.9, 16).translate(0, 0.45, 0), 0x2f4a3a),
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 16).translate(0, 0.93, 0), 0x263b2f),
    paint(new THREE.BoxGeometry(0.12, 0.04, 0.04).translate(0, 0.98, 0), 0x1c1c1c),
  ]), r: 0.3, h: 0.47, m: 14 }),
  news: () => ({ g: merge([
    paint(new THREE.BoxGeometry(0.46, 0.95, 0.4).translate(0, 0.475, 0), 0x2a4fa8),
    paint(new THREE.BoxGeometry(0.36, 0.26, 0.02).translate(0, 0.7, 0.205), 0xd8dde0),
    paint(new THREE.BoxGeometry(0.46, 0.06, 0.42).translate(0, 0.98, 0), 0x1d3a80),
  ]), r: 0.3, h: 0.5, m: 22 }),
  crate: () => ({ g: merge([
    paint(new THREE.BoxGeometry(0.62, 0.62, 0.62).translate(0, 0.31, 0), 0x9a7448),
    paint(new THREE.BoxGeometry(0.64, 0.08, 0.64).translate(0, 0.08, 0), 0x7a5a36),
    paint(new THREE.BoxGeometry(0.64, 0.08, 0.64).translate(0, 0.54, 0), 0x7a5a36),
  ]), r: 0.36, h: 0.31, m: 10 }),
  barrel: () => ({ g: merge([
    paint(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 16).translate(0, 0.44, 0), 0x5a6a7a),
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16).translate(0, 0.3, 0), 0x3a4652),
    paint(new THREE.CylinderGeometry(0.3, 0.3, 0.04, 16).translate(0, 0.62, 0), 0x3a4652),
  ]), r: 0.3, h: 0.45, m: 18 }),
  chair: () => ({ g: merge([
    paint(new THREE.BoxGeometry(0.44, 0.04, 0.42).translate(0, 0.44, 0), 0xf0efe8),
    paint(new THREE.BoxGeometry(0.44, 0.42, 0.04).translate(0, 0.66, -0.2).rotateX(-0.12), 0xf0efe8),
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([a, b]) => paint(new THREE.CylinderGeometry(0.018, 0.018, 0.44, 6).translate(a * 0.19, 0.22, b * 0.18), 0xe6e5de)),
  ]), r: 0.3, h: 0.4, m: 2.5 }),
};

export function installProps(game) {
  const { scene, collision, graph, player, S, traffic, police, parked, combat, q } = game;
  const max = q.label === 'Phone' ? 70 : 170;
  let seed = 4242; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const inBuilding = (x, z, m = 0.2) => { let hit = false; collision.query(x, z, 2, (it) => { if (it.t === 0 && x > it.minX - m && x < it.maxX + m && z > it.minZ - m && z < it.maxZ + m) hit = true; }); return hit; };
  const items = [];
  const add = (type, x, z, rotY) => {
    if (items.length >= max || inBuilding(x, z, 0.4)) return;
    // only on a sidewalk (not out on the grass verge beyond the last street)
    const pv = collision.paved(x, z);
    if (pv === null || (Math.abs(pv - CITY.height - 0.22) > 0.01 && Math.abs(pv - TOWN.height - 0.22) > 0.01)) return;
    const y = collision.surface(x, z, 400);
    items.push({ type, home: { x, y, z, rotY }, p: new THREE.Vector3(x, y, z), v: new THREE.Vector3(), q: new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY), w: new THREE.Vector3(), sleep: true, still: 0 });
  };
  // the sidewalks of the city and the town
  const streets = graph.edges.filter((e) => (e.a[0] === 'c' || e.a[0] === 't') && (e.b[0] === 'c' || e.b[0] === 't'));
  for (let pass = 0; pass < 4 && items.length < max; pass++) {
    for (const e of streets) {
      if (items.length >= max) break;
      const i = 1 + ((rnd() * (e.pts.length - 1)) | 0);
      const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[Math.min(i, e.pts.length - 1)];
      const L = Math.hypot(bx - ax, bz - az) || 1, tx = (bx - ax) / L, tz = (bz - az) / L, t = rnd();
      const cx = ax + (bx - ax) * t, cz = az + (bz - az) * t, side = rnd() < 0.5 ? 1 : -1;
      const nx = -tz * side, nz = tx * side, w2 = (e.width || 10) / 2;
      const k = rnd();
      if (k < 0.18) { // road works: a line of cones along the curb
        for (let j = 0; j < 4; j++) add('cone', cx + nx * (w2 + 0.4) + tx * j * 1.6, cz + nz * (w2 + 0.4) + tz * j * 1.6, rnd() * 6);
      } else {
        const type = k < 0.5 ? 'can' : k < 0.64 ? 'news' : k < 0.76 ? 'crate' : k < 0.88 ? 'barrel' : 'chair';
        const off = w2 + 1.4 + rnd() * 1.6;
        add(type, cx + nx * off, cz + nz * off, Math.atan2(-nx, -nz) + (rnd() - 0.5) * 0.4);
        if (type === 'crate' && rnd() < 0.5) add('crate', cx + nx * off + tx * 0.7, cz + nz * off + tz * 0.7, rnd() * 6);
        if (type === 'chair' && rnd() < 0.6) add('chair', cx + nx * off + tx * 0.8, cz + nz * off + tz * 0.8, rnd() * 6);
      }
    }
  }
  // one instanced mesh per kind
  const meshes = {}, defs = {};
  const mat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7, metalness: 0.1 });
  for (const type of Object.keys(TYPES)) {
    const list = items.filter((it) => it.type === type);
    if (!list.length) continue;
    const d = (defs[type] = TYPES[type]());
    const im = new THREE.InstancedMesh(d.g, mat, list.length);
    im.castShadow = true; im.receiveShadow = true; im.frustumCulled = false; im.userData.noReflect = true;
    im.userData.substrate = { cone: 'plastic', can: 'sheet-metal', news: 'sheet-metal', crate: 'wood', barrel: 'sheet-metal', chair: 'plastic' }[type] || 'plastic'; // for the substrate scanner and the wear
    list.forEach((it, i) => { it.idx = i; it.im = im; it.d = d; });
    meshes[type] = im; scene.add(im);
  }
  const _m = new THREE.Matrix4(), _one = new THREE.Vector3(1, 1, 1), _a = new THREE.Vector3(), _dq = new THREE.Quaternion();
  const write = (it) => { _m.compose(it.p, it.q, _one); it.im.setMatrixAt(it.idx, _m); it.im.instanceMatrix.needsUpdate = true; };
  for (const it of items) write(it);
  const wake = (it) => { it.sleep = false; it.still = 0; it.moved = true; };
  const kick = (it, vx, vy, vz, spin) => {
    wake(it);
    const k = Math.min(1, 12 / it.d.m);
    it.v.x += vx * k; it.v.y += vy * k; it.v.z += vz * k;
    it.w.x += (Math.random() - 0.5) * spin * k; it.w.y += (Math.random() - 0.5) * spin * k; it.w.z += (Math.random() - 0.5) * spin * k;
  };

  // bullets: ray against the props near the line of fire
  combat.rayProps = (o, dir, maxT) => {
    let best = null;
    for (const it of items) {
      _a.set(it.p.x, it.p.y + it.d.h, it.p.z).sub(o);
      const t = _a.dot(dir);
      if (t < 0 || t > maxT) continue;
      const d2 = _a.lengthSq() - t * t, r = it.d.r * 1.05;
      if (d2 > r * r) continue;
      const th = t - Math.sqrt(r * r - d2);
      if (!best || th < best.t) best = { t: Math.max(0, th), p: it };
    }
    return best;
  };
  combat.onPropHit = (hit, w) => {
    const it = hit.prop, dir = hit.dir; if (!it || !dir) return;
    const f = 2.2 + (w.pen || 1) * 1.2 + (w.pellets > 1 ? 2 : 0);
    kick(it, dir.x * f, 1.2 + Math.random(), dir.z * f, 8);
    game.audio?.thud?.(0.25);
  };
  combat.onExplosion = (at, power) => {
    const R = 4 + power * 1.5;
    for (const it of items) {
      _a.set(it.p.x - at.x, 0, it.p.z - at.z); const d = _a.length();
      if (d > R) continue;
      const f = (1 - d / R) * (8 + power * 2);
      _a.normalize();
      kick(it, _a.x * f, 3 + f * 0.6, _a.z * f, 18);
    }
  };

  const vehicles = () => [S.vehicle, ...traffic.cars.map((c) => c.v), ...police.cars.map((c) => c.v), ...parked].filter(Boolean);
  let reset = 0;
  return {
    items,
    update(dt) {
      if (!items.length) return;
      dt = Math.min(dt, 0.05);
      const px = player.pos.x, pz = player.pos.z;
      const cars = vehicles().filter((v) => Math.abs(v.speed || 0) > 0.8 && Math.abs(v.pos.x - px) < 140 && Math.abs(v.pos.z - pz) < 140);
      for (const it of items) {
        const dx0 = it.p.x - px, dz0 = it.p.z - pz;
        if (dx0 * dx0 + dz0 * dz0 > 140 * 140) continue;
        // cars plough through them
        for (const v of cars) {
          const rx = it.p.x - v.pos.x, rz = it.p.z - v.pos.z;
          if (rx * rx + rz * rz > 36) continue;
          const c = Math.cos(v.heading), s = Math.sin(v.heading);
          const lx = rx * c - rz * s, lz = rx * s + rz * c; // into the car's frame (+z forward)
          const hw = (v.spec?.width || 1.9) / 2 + it.d.r, hl = (v.spec?.len || 4.5) / 2 + it.d.r;
          if (Math.abs(lx) > hw || Math.abs(lz) > hl) continue;
          const sp = Math.abs(v.speed);
          kick(it, v.vel.x * 1.35 + (lx >= 0 ? 1 : -1) * c * sp * 0.25, 1.5 + sp * 0.22, v.vel.y * 1.35 - (lx >= 0 ? 1 : -1) * s * sp * 0.25, 4 + sp * 0.9);
          // pushed out of the car the shortest way
          const penX = hw - Math.abs(lx), penZ = hl - Math.abs(lz);
          if (penZ < penX) { const k = Math.sign(lz || 1) * (penZ + 0.05); it.p.x += s * k; it.p.z += c * k; }
          else { const k = Math.sign(lx || 1) * (penX + 0.05); it.p.x += c * k; it.p.z -= s * k; }
          if (v === S.vehicle) { game.audio?.thud?.(Math.min(1, it.d.m / 15)); v.vel.multiplyScalar(1 - Math.min(0.06, it.d.m / 600)); }
        }
        // walking into them
        if (S.mode === 'foot' && !S.indoors) {
          const rr = it.d.r + 0.35;
          if (dx0 * dx0 + dz0 * dz0 < rr * rr && it.p.y < player.pos.y + 0.6) {
            const d = Math.hypot(dx0, dz0) || 1, sp = Math.hypot(player.vel.x, player.vel.z);
            if (sp > 0.8) kick(it, (dx0 / d) * (1.2 + sp * 0.7), 0.8 + sp * 0.15, (dz0 / d) * (1.2 + sp * 0.7), 3 + sp);
            it.p.x = px + (dx0 / d) * rr; it.p.z = pz + (dz0 / d) * rr;
          }
        }
        if (it.sleep) continue;
        // integrate
        it.v.y -= 9.8 * dt;
        const ox = it.p.x, oz = it.p.z;
        it.p.addScaledVector(it.v, dt);
        if (inBuilding(it.p.x, it.p.z, it.d.r * 0.5)) { it.p.x = ox; it.p.z = oz; it.v.x *= -0.3; it.v.z *= -0.3; }
        const g = collision.surface(it.p.x, it.p.z, it.p.y + 1);
        let ground = false;
        if (it.p.y <= g) {
          it.p.y = g; ground = true;
          if (it.v.y < -2) { it.v.y = -it.v.y * 0.28; it.w.multiplyScalar(0.7); if (it.v.y > 1.5) game.audio?.thud?.(0.15); } else it.v.y = 0;
          const fr = Math.exp(-5 * dt); it.v.x *= fr; it.v.z *= fr;
          it.w.multiplyScalar(Math.exp(-4 * dt));
          // tip over onto a side or stand back up, whichever is closer
          _a.set(0, 1, 0).applyQuaternion(it.q);
          const upright = Math.abs(_a.y) > 0.6;
          const target = upright ? new THREE.Vector3(0, Math.sign(_a.y) || 1, 0) : new THREE.Vector3(_a.x, 0, _a.z).normalize();
          _dq.setFromUnitVectors(_a, target); _dq.slerp(new THREE.Quaternion(), 1 - Math.min(1, dt * 6));
          it.q.premultiply(_dq);
        }
        const wl = it.w.length();
        if (wl > 1e-4) { _dq.setFromAxisAngle(_a.copy(it.w).divideScalar(wl), wl * dt); it.q.premultiply(_dq).normalize(); }
        // lying on its side, it rests a little lower
        if (ground) { _a.set(0, 1, 0).applyQuaternion(it.q); if (Math.abs(_a.y) < 0.6) it.p.y = g + it.d.r * 0.75 - it.d.h * Math.abs(_a.y); }
        write(it);
        if (ground && it.v.lengthSq() < 0.02 && wl < 0.15) { if ((it.still += dt) > 0.6) { it.sleep = true; it.v.set(0, 0, 0); it.w.set(0, 0, 0); } } else it.still = 0;
      }
      // the city tidies up what's been knocked over once you're far away
      if ((reset -= dt) <= 0) {
        reset = 3;
        for (const it of items) {
          if (!it.moved || !it.sleep) continue;
          const d = Math.hypot(it.home.x - px, it.home.z - pz);
          if (d < 180) continue;
          it.p.set(it.home.x, it.home.y, it.home.z); it.q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), it.home.rotY); it.moved = false; write(it);
        }
      }
    },
  };
}
