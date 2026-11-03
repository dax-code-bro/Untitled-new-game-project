// Find a small summit far from the towns with a flat top and a wide view down
// over open low ground on one side: where a gang that doesn't want to be found
// would live. Also lays a dirt track up to it from the nearest road.
import * as THREE from 'three';
import { WORLD, CITY, TOWN } from './layout.js';
import { nearestRoad } from '../systems/world-util.js';

export function findHilltop(hm, graph, collision) {
  const H = (x, z) => hm.height(x, z);
  const cityC = [CITY.x0 + (CITY.nx * CITY.pitch) / 2, CITY.z0 + (CITY.nz * CITY.pitch) / 2];
  const townC = [TOWN.x0 + (TOWN.nx * TOWN.pitch) / 2, TOWN.z0 + (TOWN.nz * TOWN.pitch) / 2];
  let best = null;
  const lim = WORLD.half - 260;
  for (let x = -lim; x <= lim; x += 48) for (let z = -lim; z <= lim; z += 48) {
    if (Math.hypot(x - cityC[0], z - cityC[1]) < 1100 || Math.hypot(x - townC[0], z - townC[1]) < 650) continue;
    const h = H(x, z);
    if (h < hm.waterLevel(x, z) + 4) continue;
    // a flat-ish top for the yard (24 m square within 3 m)
    let lo = Infinity, hi = -Infinity;
    for (const [a, b] of [[-12, -12], [12, -12], [-12, 12], [12, 12], [0, 0], [-12, 0], [12, 0], [0, -12], [0, 12]]) { const y = H(x + a, z + b); lo = Math.min(lo, y); hi = Math.max(hi, y); }
    if (hi - lo > 3) continue;
    // standing above its surroundings
    let ring = 0;
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; ring += H(x + Math.cos(a) * 220, z + Math.sin(a) * 220); }
    const prominence = h - ring / 12;
    if (prominence < 12) continue;
    // the view: the direction where the land falls away furthest
    let view = -Infinity, face = 0;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a);
      let drop = 0, n = 0;
      for (let d = 150; d <= 600; d += 75) { const px = x + dx * d, pz = z + dz * d; if (Math.abs(px) > WORLD.half || Math.abs(pz) > WORLD.half) continue; drop += h - H(px, pz); n++; }
      if (n && drop / n > view) { view = drop / n; face = a; }
    }
    if (view < 18) continue;
    let blocked = false;
    collision.query(x, z, 20, (it) => { if (it.t === 0) blocked = true; });
    if (blocked) continue;
    const r = nearestRoad(graph, x, z);
    const roadD = r ? r.dist : 9999;
    if (roadD > 700) continue; // a long but drivable track, not a hike
    const score = prominence * 1.2 + view - (hi - lo) * 4 - roadD * 0.02;
    if (!best || score > best.score) best = { x, z, y: h, face, score, prominence, view, road: r };
  }
  return best;
}

// A packed-dirt track from the road to the yard: a ribbon draped on the terrain.
export function buildTrack(scene, hm, from, to) {
  const pts = [];
  const L = Math.hypot(to.x - from.x, to.z - from.z), n = Math.max(8, Math.ceil(L / 6));
  // a gentle S so it reads as a hill road, not a ruler line
  const nx = -(to.z - from.z) / L, nz = (to.x - from.x) / L;
  for (let i = 0; i <= n; i++) {
    const t = i / n, bend = Math.sin(t * Math.PI * 2) * Math.min(40, L * 0.08) * (1 - t);
    const x = from.x + (to.x - from.x) * t + nx * bend, z = from.z + (to.z - from.z) * t + nz * bend;
    pts.push(new THREE.Vector3(x, hm.height(x, z) + 0.08, z));
  }
  const pos = [], uv = [], idx = [], W = 3.2;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], q = pts[Math.min(i + 1, pts.length - 1)], o = pts[Math.max(i - 1, 0)];
    const dx = q.x - o.x, dz = q.z - o.z, l = Math.hypot(dx, dz) || 1, sx = -dz / l, sz = dx / l;
    for (const s of [-1, 1]) { const x = p.x + sx * s * W / 2, z = p.z + sz * s * W / 2; pos.push(x, hm.height(x, z) + 0.08, z); uv.push(s < 0 ? 0 : 1, i * 0.5); }
    if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals();
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const x = c.getContext('2d');
  x.fillStyle = '#7a6448'; x.fillRect(0, 0, 64, 128);
  for (let i = 0; i < 900; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(60,45,30,0.35)' : 'rgba(150,130,100,0.3)'; x.fillRect(Math.random() * 64, Math.random() * 128, 2, 2); }
  x.fillStyle = 'rgba(70,100,50,0.5)'; x.fillRect(0, 0, 9, 128); x.fillRect(55, 0, 9, 128); x.fillRect(28, 0, 8, 128); // grass on the edges and the crown
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, polygonOffset: true, polygonOffsetFactor: -2 }));
  m.receiveShadow = true; m.userData.noHit = true;
  scene.add(m);
  return { mesh: m, pts };
}
