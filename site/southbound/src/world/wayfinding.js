// Road signs that point the way. For every place worth finding (gunsmiths,
// armour, clothing, Gulf Marts, the auction house...), a shortest-path tree
// over the road network tells each junction which way to turn. Blue service
// signs stand on the right of every approach to a junction: "← Gulf Coast
// Tactical 0.4 mi". Posts are one merged mesh; the plates near you are drawn
// on a small pool of canvases, so hundreds of signs cost almost nothing.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nearestRoad } from '../systems/world-util.js';

const POOL = 28, MAX_D = 1500;

export function createWayfinding(game, places) {
  const { scene, graph, collision, player } = game;
  const nodes = graph.nodes, edges = graph.edges;
  const other = (e, id) => (e.a === id ? e.b : e.a);
  const elen = (e) => { let L = 0; for (let i = 1; i < e.pts.length; i++) L += Math.hypot(e.pts[i][0] - e.pts[i - 1][0], e.pts[i][1] - e.pts[i - 1][1]); return L; };
  const lens = new Map(edges.map((e) => [e.id, e.len || elen(e)]));
  // direction of travel arriving at node `id` along edge e, and leaving it along e
  const arrive = (e, id) => { const P = e.pts, n = P.length; const [a, b] = e.b === id ? [P[n - 2], P[n - 1]] : [P[1], P[0]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  const leave = (e, id) => { const P = e.pts, n = P.length; const [a, b] = e.a === id ? [P[0], P[1]] : [P[n - 1], P[n - 2]]; const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };

  // ---- shortest paths from each place
  const plates = new Map(); // key edge:node -> {x,z,yaw, list:[{name, arrow, d}]}
  for (const pl of places) {
    const r = nearestRoad(graph, pl.x, pl.z);
    if (!r) continue;
    const dist = new Map(), via = new Map();
    const q = [];
    for (const id of [r.edge.a, r.edge.b]) { const n = nodes.get(id); const d = Math.hypot(n.x - pl.x, n.z - pl.z); dist.set(id, d); via.set(id, r.edge); q.push(id); }
    while (q.length) { // small graphs: a simple label-correcting search is fine
      q.sort((a, b) => dist.get(a) - dist.get(b));
      const id = q.shift(), d0 = dist.get(id);
      if (d0 > MAX_D) continue;
      for (const eid of nodes.get(id).edges) {
        const e = edges[eid], nb = other(e, id), nd = d0 + lens.get(eid);
        if (nd < (dist.get(nb) ?? Infinity)) { dist.set(nb, nd); via.set(nb, e); if (!q.includes(nb)) q.push(nb); }
      }
    }
    for (const [id, d] of dist) {
      const n = nodes.get(id);
      if (n.edges.length < 3 || d < 70 || d > MAX_D) continue;
      const out = via.get(id), [ox, oz] = leave(out, id);
      for (const eid of n.edges) {
        const e = edges[eid]; if (e === out) continue;
        const [ix, iz] = arrive(e, id);
        const dot = ix * ox + iz * oz, cross = ix * oz - iz * ox;
        const arrow = dot > 0.72 ? '↑' : cross > 0 ? '→' : '←';
        if (dot < -0.8) continue; // a U-turn: no sign
        const key = eid + ':' + id;
        let P = plates.get(key);
        if (!P) {
          // ~20 m before the junction, on the right of the road
          const back = Math.min(20, lens.get(eid) * 0.4);
          const x0 = n.x - ix * back, z0 = n.z - iz * back, off = (e.width || 8) / 2 + 1.4;
          const rx = -iz, rz = ix; // right of travel
          const x = x0 - rx * off, z = z0 - rz * off;
          let blocked = false;
          collision.query(x, z, 2, (it) => { if (it.t === 0 && x > it.minX - 0.3 && x < it.maxX + 0.3 && z > it.minZ - 0.3 && z < it.maxZ + 0.3) blocked = true; });
          if (blocked) continue;
          P = { x, z, y: collision.surface(x, z, 400), yaw: Math.atan2(-ix, -iz), list: [] };
          plates.set(key, P);
        }
        P.list.push({ name: pl.name, arrow, d: d + 20 });
      }
    }
  }
  const posts = [...plates.values()].filter((p) => p.list.length);
  for (const p of posts) { p.list.sort((a, b) => a.d - b.d); p.list = p.list.slice(0, 3); }

  // ---- posts: one mesh
  if (!posts.length) return { update() {}, count: 0 };
  const geos = [];
  for (const p of posts) { const h = 2.3 + p.list.length * 0.42; geos.push(new THREE.CylinderGeometry(0.045, 0.045, h, 6).translate(p.x, p.y + h / 2, p.z)); }
  const postMesh = new THREE.Mesh(mergeGeometries(geos), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.4, metalness: 0.8 }));
  postMesh.castShadow = true; postMesh.userData.noHit = true; scene.add(postMesh);

  // ---- plates near the player, drawn on demand
  const pool = [];
  for (let i = 0; i < POOL; i++) {
    const c = document.createElement('canvas'); c.width = 512; c.height = 72;
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 0.3), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, side: THREE.DoubleSide }));
    m.visible = false; m.userData.noHit = true; scene.add(m);
    pool.push({ c, tex, m, key: null });
  }
  const fmt = (d) => d < 300 ? `${Math.round(d * 3.281 / 50) * 50} ft` : `${(d / 1609).toFixed(1)} mi`;
  const draw = (slot, e) => {
    const x = slot.c.getContext('2d'), W = 512, H = 72;
    x.fillStyle = '#1f4f8a'; x.fillRect(0, 0, W, H);
    x.strokeStyle = '#ffffff'; x.lineWidth = 4; x.strokeRect(5, 5, W - 10, H - 10);
    x.fillStyle = '#ffffff'; x.textBaseline = 'middle';
    x.font = 'bold 44px Arial, sans-serif'; x.textAlign = 'center';
    const left = e.arrow === '←';
    x.fillText(e.arrow, left ? 38 : W - 38, H / 2 + 2);
    let fs = 30; x.textAlign = 'left';
    do { x.font = `bold ${fs}px Arial Narrow, Arial, sans-serif`; fs -= 1; } while (x.measureText(e.name).width > 300 && fs > 14);
    x.fillText(e.name, left ? 72 : 22, H / 2 + 1);
    x.font = 'bold 24px Arial, sans-serif'; x.textAlign = 'right'; x.fillText(fmt(e.d), left ? W - 22 : W - 74, H / 2 + 1);
    slot.tex.needsUpdate = true;
  };
  let t = 0;
  return {
    count: posts.length,
    posts,
    update(dt) {
      if ((t -= dt) > 0) return;
      t = 0.5;
      const px = player.pos.x, pz = player.pos.z;
      const near = [];
      for (const p of posts) { const d = (p.x - px) ** 2 + (p.z - pz) ** 2; if (d < 160 * 160) near.push([d, p]); }
      near.sort((a, b) => a[0] - b[0]);
      const want = [];
      for (const [, p] of near) { p.list.forEach((e, i) => want.push({ key: p.x.toFixed(1) + ':' + p.z.toFixed(1) + ':' + i, p, e, i })); if (want.length >= POOL) break; }
      const keep = new Set(want.map((w) => w.key));
      for (const s of pool) if (s.key && !keep.has(s.key)) { s.key = null; s.m.visible = false; }
      for (const w of want.slice(0, POOL)) {
        if (pool.some((s) => s.key === w.key)) continue;
        const s = pool.find((x) => !x.key); if (!s) break;
        s.key = w.key; draw(s, w.e);
        const h = 2.3 + w.p.list.length * 0.42 - 0.25 - w.i * 0.38;
        s.m.position.set(w.p.x + Math.sin(w.p.yaw) * 0.06, w.p.y + h, w.p.z + Math.cos(w.p.yaw) * 0.06);
        s.m.rotation.set(0, w.p.yaw, 0); s.m.visible = true;
      }
    },
  };
}
