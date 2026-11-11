// Street clutter (G12): the things that make a street look used rather than freshly built.
//  - a stop sign on every approach to every junction in Port Calvera, Mill Creek and the outer
//    neighbourhoods, and on one corner the green street-name blades (real names: Mill Creek's Main,
//    Pecan, Magnolia...; the city's numbered streets and its avenues)
//  - manhole covers in the lanes and storm-drain grates in the gutters, a kerb inlet beside each
//  - litter in the gutters and on the pavements: paper, cans, cups, cigarette butts, leaves (thick
//    downtown, light in town)
//  - weeds: tufts of grass in the crack between pavement and kerb, at the foot of walls and fences
//  - Mill Creek gets fire hydrants and public bins on its corners (the city already has both)
// All instanced, only the nearby ones drawn (core/nearinst.js), on every preset.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { nearInstances, NEAR_RANGE } from '../core/nearinst.js';
import { CITY, TOWN } from './layout.js';

const TOWN_STREETS_X = ['Bayou Rd', 'Pecan St', 'Main St', 'Magnolia St', 'Cypress St'];
const TOWN_STREETS_Z = ['Mill Rd', 'Church St', 'Depot St', 'Oak St'];
const CITY_AVES = ['Harbor Ave', 'Gulf Ave', 'Canal Ave', 'Palmetto Ave', 'Royal Ave', 'Levee Ave', 'Market Ave'];
const CITY_STS = ['1st St', '2nd St', '3rd St', '4th St', '5th St', '6th St', '7th St', '8th St', '9th St', '10th St'];

function hash(a, b) { const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return s - Math.floor(s); }
const tint = (g, hex) => {
  g = g.index ? g.toNonIndexed() : g;
  if (g.attributes.uv) g.deleteAttribute('uv');
  const c = new THREE.Color(hex), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
};
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

export function buildStreetClutter({ scene, graph, hm, collision, quality: q, yards = null }) {
  const near = NEAR_RANGE[q.label] || 140;
  const out = { stops: 0, names: 0, manholes: 0, drains: 0, litter: 0, weeds: 0, hydrants: 0, bins: 0 };
  const lists = new Map(); // key -> { make, mat, list }
  const put = (key, x, y, z, ry, sx = 1, sy = 1, sz = 1) => { const L = lists.get(key); L.list.push(new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(sx, sy, sz))); };
  const UP = new THREE.Vector3(0, 1, 0);
  const surf = (x, z, yh) => Math.max(hm.height(x, z), collision.surface(x, z, yh + 1.5));
  const isGrid = (id) => id[0] === 'c' || id[0] === 't';
  const blocked = (x, z, r) => { let b = false; collision.query(x, z, r + 2, (it) => { if (b) return; if (it.t === 0 && !it.data?.walkable && x > it.minX - r && x < it.maxX + r && z > it.minZ - r && z < it.maxZ + r) b = true; else if (it.t === 1 && it.r > 0 && Math.hypot(it.x - x, it.z - z) < it.r + r) b = true; }); return b; };

  // ---- materials and parts
  const paint = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.2 });
  const stopTex = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#ffffff'; x.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; x.lineTo(w / 2 + Math.cos(a) * w * 0.5, h / 2 + Math.sin(a) * h * 0.5); } x.fill();
    x.fillStyle = '#b8141a'; x.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; x.lineTo(w / 2 + Math.cos(a) * w * 0.46, h / 2 + Math.sin(a) * h * 0.46); } x.fill();
    x.fillStyle = '#ffffff'; x.font = 'bold 38px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('STOP', w / 2, h / 2 + 2);
  });
  const stopFace = new THREE.MeshStandardMaterial({ map: stopTex, roughness: 0.45, metalness: 0.1, transparent: true, alphaTest: 0.5 });
  const octGeo = () => { const s = new THREE.Shape(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4, x = Math.cos(a) * 0.38, y = Math.sin(a) * 0.38; if (i) s.lineTo(x, y); else s.moveTo(x, y); } const g = new THREE.ShapeGeometry(s); const uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / 0.76 + 0.5, p.getY(i) / 0.76 + 0.5); return g.translate(0, 2.25, 0.03); };
  lists.set('stopFace', { make: octGeo, mat: stopFace, list: [] });
  lists.set('stopPost', { make: () => mergeGeometries([tint(new THREE.BoxGeometry(0.06, 2.6, 0.06).translate(0, 1.3, 0), 0x8a8e92), tint(new THREE.CylinderGeometry(0.39, 0.39, 0.02, 8).rotateX(Math.PI / 2).rotateZ(Math.PI / 8).translate(0, 2.25, 0.015), 0x6a6e72)]), mat: paint, list: [] });
  // street-name blades: one texture per name, both faces; mounted in a cross on top of a stop post
  const names = new Map();
  const blade = (name) => {
    if (names.has(name)) return names.get(name);
    const t = canvasTex(256, 48, (x, w, h) => { x.fillStyle = '#1f6b3a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#f2f2f2'; x.lineWidth = 3; x.strokeRect(3, 3, w - 6, h - 6); x.fillStyle = '#f4f4f0'; x.font = 'bold 30px Arial, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(name.toUpperCase(), w / 2, h / 2 + 1); });
    const key = 'name:' + name;
    lists.set(key, { make: () => new THREE.PlaneGeometry(0.9, 0.17), mat: new THREE.MeshStandardMaterial({ map: t, roughness: 0.4, side: THREE.DoubleSide }), list: [] });
    names.set(name, key);
    return key;
  };
  // manhole: cast iron with a cross-hatch pattern and the city's name round the rim
  const holeTex = canvasTex(128, 128, (x, w, h) => {
    x.fillStyle = '#2b2a28'; x.beginPath(); x.arc(64, 64, 63, 0, Math.PI * 2); x.fill();
    x.strokeStyle = '#3d3b37'; x.lineWidth = 3; for (let k = -60; k <= 60; k += 10) { x.beginPath(); x.moveTo(64 + k - 60, 4); x.lineTo(64 + k + 60, 124); x.stroke(); x.beginPath(); x.moveTo(64 + k + 60, 4); x.lineTo(64 + k - 60, 124); x.stroke(); }
    x.strokeStyle = '#1c1b1a'; x.lineWidth = 8; x.beginPath(); x.arc(64, 64, 58, 0, Math.PI * 2); x.stroke();
    x.fillStyle = '#4a4742'; x.font = 'bold 13px Arial'; x.textAlign = 'center'; x.fillText('CALVERA', 64, 30); x.fillText('SEWER', 64, 106);
  });
  lists.set('manhole', { make: () => new THREE.CircleGeometry(0.34, 20).rotateX(-Math.PI / 2), mat: new THREE.MeshStandardMaterial({ map: holeTex, roughness: 0.8, metalness: 0.1, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), list: [] });
  const grateTex = canvasTex(64, 128, (x, w, h) => { x.fillStyle = '#0c0c0c'; x.fillRect(0, 0, w, h); x.fillStyle = '#3a3936'; x.fillRect(0, 0, w, 6); x.fillRect(0, h - 6, w, 6); x.fillRect(0, 0, 6, h); x.fillRect(w - 6, 0, 6, h); for (let k = 12; k < h - 6; k += 10) x.fillRect(6, k, w - 12, 4); });
  lists.set('grate', { make: () => new THREE.PlaneGeometry(0.45, 0.9).rotateX(-Math.PI / 2), mat: new THREE.MeshStandardMaterial({ map: grateTex, color: 0x9a9590, roughness: 0.9, metalness: 0, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 }), list: [] });
  lists.set('inlet', { make: () => tint(new THREE.BoxGeometry(0.95, 0.09, 0.03), 0x0a0a0a), mat: paint, list: [] });
  // litter: eight kinds, each its own little decal
  const LIT = [
    ['paper', 0.24, (x, w, h) => { x.fillStyle = '#e8e4da'; x.beginPath(); x.moveTo(8, 14); x.lineTo(50, 6); x.lineTo(58, 44); x.lineTo(30, 58); x.lineTo(6, 46); x.closePath(); x.fill(); x.strokeStyle = '#b8b2a4'; x.lineWidth = 2; for (let k = 0; k < 4; k++) { x.beginPath(); x.moveTo(14, 20 + k * 8); x.lineTo(46, 16 + k * 8); x.stroke(); } }],
    ['news', 0.4, (x, w, h) => {
      // a folded newspaper, a little crumpled and grubby: torn outline, headline, photo, faint columns, the fold's shadow
      x.fillStyle = '#c9c3b4'; x.beginPath(); x.moveTo(6, 12); x.lineTo(30, 8); x.lineTo(58, 11); x.lineTo(56, 52); x.lineTo(34, 56); x.lineTo(8, 53); x.closePath(); x.fill();
      x.fillStyle = 'rgba(90,80,64,0.25)'; x.fillRect(30, 8, 4, 48);
      x.fillStyle = '#2a2a2a'; x.fillRect(10, 15, 18, 3); x.fillStyle = '#5a5a58'; x.fillRect(11, 21, 16, 9);
      x.fillStyle = 'rgba(70,70,70,0.45)'; for (let k = 0; k < 7; k++) { x.fillRect(11, 33 + k * 2.6, 7, 1); x.fillRect(20, 33 + k * 2.6, 7, 1); x.fillRect(37, 15 + k * 4.4, 17, 1); }
      x.fillStyle = 'rgba(110,96,70,0.22)'; x.beginPath(); x.ellipse(46, 44, 9, 6, 0.4, 0, Math.PI * 2); x.fill();
    }],
    ['can', 0.17, (x, w, h) => { x.fillStyle = '#b8231e'; x.fillRect(10, 24, 44, 16); x.fillStyle = '#c8ccd0'; x.fillRect(6, 24, 6, 16); x.fillRect(52, 24, 6, 16); x.fillStyle = '#f2f2f2'; x.fillRect(22, 28, 18, 4); }],
    ['cup', 0.19, (x, w, h) => { x.fillStyle = '#f2f0ea'; x.beginPath(); x.moveTo(10, 22); x.lineTo(54, 26); x.lineTo(50, 40); x.lineTo(12, 42); x.closePath(); x.fill(); x.fillStyle = '#2a6a3a'; x.fillRect(26, 26, 12, 12); }],
    ['butts', 0.17, (x, w, h) => { for (let k = 0; k < 6; k++) { const px = 10 + (k * 17) % 44, py = 12 + (k * 23) % 40; x.save(); x.translate(px, py); x.rotate(k * 1.1); x.fillStyle = '#f2efe6'; x.fillRect(0, 0, 12, 3); x.fillStyle = '#c98a3c'; x.fillRect(-5, 0, 5, 3); x.restore(); } }],
    ['leaves', 0.75, (x, w, h) => { for (let k = 0; k < 12; k++) { x.fillStyle = ['#7a5a2a', '#9a6a2a', '#5a4a24', '#8a7a3a'][k % 4]; x.beginPath(); x.ellipse(8 + (k * 13) % 48, 8 + (k * 29) % 48, 6, 3, k, 0, Math.PI * 2); x.fill(); } }],
    ['wrapper', 0.17, (x, w, h) => { x.fillStyle = '#e0b020'; x.fillRect(8, 22, 48, 18); x.fillStyle = '#c02020'; x.fillRect(20, 26, 24, 10); }],
    ['bag', 0.4, (x, w, h) => { x.fillStyle = 'rgba(240,240,240,0.85)'; x.beginPath(); x.moveTo(12, 10); x.quadraticCurveTo(32, 2, 52, 12); x.lineTo(56, 50); x.quadraticCurveTo(32, 60, 8, 50); x.closePath(); x.fill(); x.strokeStyle = 'rgba(180,180,180,0.8)'; x.lineWidth = 2; x.stroke(); }],
  ];
  for (const [k, size, draw] of LIT) {
    const t = canvasTex(64, 64, (x, w, h) => { x.clearRect(0, 0, w, h); draw(x, w, h); });
    lists.set('lit:' + k, { make: () => new THREE.PlaneGeometry(size, size).rotateX(-Math.PI / 2), mat: new THREE.MeshStandardMaterial({ map: t, transparent: true, alphaTest: 0.25, roughness: 0.8, polygonOffset: true, polygonOffsetFactor: -5, polygonOffsetUnits: -5 }), list: [] });
  }
  // stains: oil drips in the lanes and parking places, old gum and spills on the pavements (soft, see-through)
  const stainTex = canvasTex(128, 128, (x, w, h) => {
    // white = leave the ground as it is; the darker, the more it darkens it (multiplied on)
    x.fillStyle = '#ffffff'; x.fillRect(0, 0, w, h);
    for (let k = 0; k < 9; k++) {
      const cx = 64 + Math.sin(k * 2.3) * 24, cy = 64 + Math.cos(k * 1.7) * 20, r = 12 + (k * 7) % 20;
      const gr = x.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(70,62,54,0.55)'); gr.addColorStop(1, 'rgba(70,62,54,0)');
      x.fillStyle = gr; x.beginPath(); x.arc(cx, cy, r, 0, Math.PI * 2); x.fill();
    }
    // a soft edge so the quad never shows
    const e = x.createRadialGradient(64, 64, 40, 64, 64, 64); e.addColorStop(0, 'rgba(255,255,255,0)'); e.addColorStop(1, 'rgba(255,255,255,1)');
    x.fillStyle = e; x.fillRect(0, 0, w, h);
  });
  lists.set('stain', { make: () => new THREE.PlaneGeometry(1.3, 1.3).rotateX(-Math.PI / 2), mat: new THREE.MeshBasicMaterial({ map: stainTex, blending: THREE.MultiplyBlending, premultipliedAlpha: true, transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }), list: [] });
  // weeds: three crossed cards of thin blades, a few heights and shades
  const weedTex = canvasTex(128, 128, (x, w, h) => {
    x.clearRect(0, 0, w, h);
    for (let k = 0; k < 26; k++) {
      const bx = 10 + (k * 37) % 108, top = 10 + (k * 53) % 70, lean = ((k * 17) % 21 - 10) * 1.6;
      x.strokeStyle = ['#5f7a2e', '#6e8a36', '#7a8a3a', '#8a8a42', '#4f6a28'][k % 5]; x.lineWidth = 2 + (k % 3);
      x.beginPath(); x.moveTo(bx, h); x.quadraticCurveTo(bx + lean * 0.3, (top + h) / 2, bx + lean, top); x.stroke();
    }
  });
  const weedMat = new THREE.MeshStandardMaterial({ map: weedTex, transparent: false, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.9 });
  lists.set('weed', { make: () => mergeGeometries([0, Math.PI / 3, (2 * Math.PI) / 3].map((a) => new THREE.PlaneGeometry(0.34, 0.3).translate(0, 0.15, 0).rotateY(a))), mat: weedMat, list: [] });
  // Mill Creek's hydrants and corner bins
  lists.set('hydrant', { make: () => mergeGeometries([tint(new THREE.CylinderGeometry(0.16, 0.18, 0.08, 12).translate(0, 0.04, 0), 0xc89a1a), tint(new THREE.CylinderGeometry(0.12, 0.13, 0.58, 12).translate(0, 0.37, 0), 0xe0b020), tint(new THREE.CylinderGeometry(0.15, 0.15, 0.05, 12).translate(0, 0.66, 0), 0xc89a1a), tint(new THREE.SphereGeometry(0.12, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, 0.68, 0), 0xe8e8e2), tint(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10).rotateZ(Math.PI / 2).translate(0.15, 0.46, 0), 0xe0b020), tint(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 10).rotateZ(Math.PI / 2).translate(-0.15, 0.46, 0), 0xe0b020), tint(new THREE.CylinderGeometry(0.07, 0.07, 0.1, 10).rotateX(Math.PI / 2).translate(0, 0.42, 0.14), 0xe0b020)]), mat: paint, list: [] });
  lists.set('bin', { make: () => mergeGeometries([tint(new THREE.CylinderGeometry(0.28, 0.25, 0.85, 14, 1, true).translate(0, 0.43, 0), 0x2f4a32), tint(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 14).translate(0, 0.88, 0), 0x263c28), tint(new THREE.CylinderGeometry(0.15, 0.15, 0.08, 10).translate(0, 0.94, 0), 0x1a1a1a), tint(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 14).translate(0, 0.05, 0), 0x2a2a2a)]), mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.3, side: THREE.DoubleSide }), list: [] });

  // ---- G14: what a city pavement holds (the furniture zone just inside the kerb)
  // a clipped shrub: five lumpy clumps of leaves in three greens (not one smooth ball)
  const bushClumps = () => {
    let sd = 7; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647);
    const greens = [0x2f5226, 0x3d6430, 0x4f7a3e];
    return [[0, 0.82, 0, 0.36], [0.2, 0.92, 0.12, 0.27], [-0.2, 0.9, -0.1, 0.28], [0.06, 1.06, -0.16, 0.24], [-0.1, 1.04, 0.18, 0.22]].map(([x, y, z, r], k) => {
      const g = new THREE.IcosahedronGeometry(r, 1), P = g.attributes.position;
      const ph = rnd() * 10; // (by position, so the corners shared by neighbouring triangles move together)
      for (let i = 0; i < P.count; i++) { const x = P.getX(i), y = P.getY(i), z = P.getZ(i), f = 0.84 + 0.3 * hash(Math.round(x * 1000) + ph, Math.round(y * 1000) * 1.37 + Math.round(z * 1000)); P.setXYZ(i, x * f, y * f * 0.85, z * f); }
      g.computeVertexNormals();
      return tint(g.translate(x, y, z), greens[k % 3]);
    });
  };
  const WOOD = 0x6b4a2e, IRON = 0x26282a, STEEL = 0x8e9499;
  lists.set('bench', { make: () => mergeGeometries([
    ...[0, 1, 2].map((k) => tint(new THREE.BoxGeometry(1.8, 0.035, 0.12).translate(0, 0.45, -0.16 + k * 0.15), WOOD)),
    ...[0, 1].map((k) => tint(new THREE.BoxGeometry(1.8, 0.1, 0.03).translate(0, 0.6 + k * 0.16, -0.26), WOOD)),
    ...[-1, 1].map((s) => tint(new THREE.BoxGeometry(0.05, 0.45, 0.42).translate(s * 0.78, 0.225, -0.02), IRON)),
    ...[-1, 1].map((s) => tint(new THREE.BoxGeometry(0.05, 0.42, 0.04).translate(s * 0.78, 0.66, -0.25), IRON)),
  ]), mat: paint, list: [] });
  lists.set('planter', { make: () => mergeGeometries([
    tint(new THREE.BoxGeometry(1.1, 0.55, 1.1).translate(0, 0.275, 0), 0x9b968c),
    tint(new THREE.BoxGeometry(1.12, 0.05, 1.12).translate(0, 0.56, 0), 0x8a857c),
    tint(new THREE.BoxGeometry(1.0, 0.02, 1.0).translate(0, 0.575, 0), 0x3a2b1e),
    ...bushClumps(),
  ]), mat: paint, list: [] });
  lists.set('news', { make: () => mergeGeometries([[-0.5, 0x2456a8], [0, 0xb22a22], [0.5, 0xd2a21c]].flatMap(([x, c]) => [
    tint(new THREE.BoxGeometry(0.44, 0.95, 0.42).translate(x, 0.6, 0), c),
    tint(new THREE.BoxGeometry(0.36, 0.3, 0.02).translate(x, 0.82, 0.215), 0xd8d6cc),
    tint(new THREE.BoxGeometry(0.46, 0.03, 0.44).translate(x, 1.09, 0), 0x2a2a2a),
    tint(new THREE.BoxGeometry(0.06, 0.13, 0.06).translate(x, 0.065, 0), 0x2a2a2a),
  ])), mat: paint, list: [] });
  lists.set('bikerack', { make: () => mergeGeometries([-0.6, 0, 0.6].flatMap((x) => [
    tint(new THREE.TorusGeometry(0.3, 0.025, 6, 12, Math.PI).rotateY(Math.PI / 2).translate(x, 0.55, 0), STEEL),
    ...[-0.3, 0.3].map((z) => tint(new THREE.CylinderGeometry(0.025, 0.025, 0.55, 6).translate(x, 0.275, z), STEEL)),
  ])), mat: paint, list: [] });

  // ---- junctions: stop signs on each approach, names on one corner
  const nameOf = (e, n) => {
    const a = graph.nodes.get(e.a), b = graph.nodes.get(e.b);
    const alongX = Math.abs(b.x - a.x) > Math.abs(b.z - a.z);
    if (n.id[0] === 't') { const [i, j] = n.id.slice(1).split('_').map(Number); return alongX ? TOWN_STREETS_Z[j % TOWN_STREETS_Z.length] : TOWN_STREETS_X[i % TOWN_STREETS_X.length]; }
    if (n.id[0] === 'c') { const [i, j] = n.id.slice(1).split('_').map(Number); return alongX ? CITY_AVES[j % CITY_AVES.length] : CITY_STS[i % CITY_STS.length]; }
    return alongX ? 'County Rd ' + (10 + Math.round(Math.abs(a.z) / 97) % 40) : 'Old Mill Rd';
  };
  for (const n of graph.nodes.values()) {
    if (!n.edges || n.edges.length < 3) continue;
    if (!isGrid(n.id) && !n.id.startsWith('o_')) continue;
    const S = n.id[0] === 'c' ? CITY.street : n.id[0] === 't' ? TOWN.street : 10;
    let first = true;
    for (const ei of n.edges) {
      const e = graph.edges[ei];
      if (e.kind === 'highway') continue;
      const P = e.pts, at0 = e.a === n.id;
      const p0 = at0 ? P[0] : P[P.length - 1], p1 = at0 ? P[Math.min(2, P.length - 1)] : P[Math.max(0, P.length - 3)];
      let dx = p1[0] - p0[0], dz = p1[1] - p0[1]; const L = Math.hypot(dx, dz) || 1; dx /= L; dz /= L; // out along this street
      // the approaching driver's right: for travel (-dx, -dz) that's (dz, -dx)
      const rx = dz, rz = -dx, hw = (e.width || S) / 2;
      const x = n.x + dx * (S / 2 + 1.3) + rx * (hw + 0.55), z = n.z + dz * (S / 2 + 1.3) + rz * (hw + 0.55);
      if (blocked(x, z, 0.3)) continue;
      const y = surf(x, z, hm.height(x, z));
      const face = Math.atan2(dx, dz); // the sign's face looks back down the street at the driver
      put('stopPost', x, y, z, face); put('stopFace', x, y, z, face);
      collision.addCircle(x, z, 0.06);
      out.stops++;
      if (first) {
        // the street-name blades: this street along the blade, the cross street across it
        first = false;
        const here = nameOf(e, n), other = n.edges.map((k) => graph.edges[k]).find((o) => o !== e && o.kind !== 'highway' && nameOf(o, n) !== here);
        put(blade(here), x, y + 2.78, z, face + Math.PI / 2); out.names++;
        if (other) { put(blade(nameOf(other, n)), x, y + 2.98, z, face); out.names++; }
      }
    }
  }

  // ---- along the streets: manholes, drains, litter, weeds, Mill Creek hydrants and bins
  const downtown = (x, z) => Math.max(0, 1 - Math.hypot(x - CITY.downtown[0], z - CITY.downtown[1]) / 600);
  for (const e of graph.edges) {
    if (e.kind === 'highway' || e.gravel) continue;
    const city = e.a[0] === 'c' && e.b[0] === 'c', town = e.a[0] === 't' && e.b[0] === 't';
    const P = e.pts, hw = (e.width || 10) / 2;
    let acc = 0, total = 0; for (let i = 1; i < P.length; i++) total += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
    let nextMan = 22, nextDrain = 9, nextHyd = 30, nextFurn = 8, furnSide = 1;
    for (let i = 1; i < P.length; i++) {
      const [ax, az] = P[i - 1], [bx, bz] = P[i], L = Math.hypot(bx - ax, bz - az); if (L < 0.01) continue;
      const tx = (bx - ax) / L, tz = (bz - az) / L, nx = -tz, nz = tx;
      for (let s = 0; s < L; s += 1) {
        const g = acc + s; if (g < 10 || g > total - 10) continue;
        const x0 = ax + tx * s, z0 = az + tz * s, h = hash(x0 * 0.7, z0 * 1.3), y0 = (e.ys ? e.ys[Math.min(e.ys.length - 1, i)] : hm.height(x0, z0));
        const yr = y0 + 0.11;
        // a manhole in the lane every ~45 m
        if (g >= nextMan) { nextMan += 45; const off = hw * 0.45 * (h < 0.5 ? -1 : 1); put('manhole', x0 + nx * off, yr + 0.004, z0 + nz * off, h * 6); out.manholes++; }
        if (!(city || town)) continue;
        // a storm drain in the gutter every ~38 m, its inlet in the kerb face
        const drain = g >= nextDrain; if (drain) nextDrain += 38;
        if (drain) for (const sd of [-1, 1]) {
          const gx = x0 + nx * sd * (hw - 0.25), gz = z0 + nz * sd * (hw - 0.25);
          put('grate', gx, yr + 0.004, gz, Math.atan2(tx, tz)); out.drains++;
          const kx = x0 + nx * sd * (hw + 0.02), kz = z0 + nz * sd * (hw + 0.02);
          put('inlet', kx, yr + 0.05, kz, Math.atan2(tx, tz) + Math.PI / 2);
        }
        // litter: in the gutter and on the pavement, much more of it downtown
        const dense = city ? 0.07 + downtown(x0, z0) * 0.24 : 0.04;
        for (const sd of [-1, 1]) {
          const hh = hash(x0 + sd * 3.1, z0 - sd * 1.7);
          if (hh < dense) {
            const kind = LIT[Math.floor(hash(hh * 91, x0) * LIT.length) % LIT.length][0];
            const where = hash(z0, hh) < 0.55 ? hw - 0.35 - hash(x0, hh) * 0.25 : hw + 0.6 + hash(hh, z0) * 2.2; // the gutter, or the pavement
            const lx = x0 + nx * sd * where + tx * (hash(hh, 3) - 0.5), lz = z0 + nz * sd * where + tz * (hash(hh, 5) - 0.5);
            const ly = where > hw ? surf(lx, lz, yr) + 0.006 : yr + 0.006;
            put('lit:' + kind, lx, ly, lz, hash(lx, lz) * 6.3); out.litter++;
            // litter gathers: the wind piles a few more pieces against the kerb
            const more = hash(hh, 11) < 0.45 ? 1 + Math.floor(hash(hh, 13) * 3) : 0;
            for (let m = 0; m < more; m++) {
              const k2 = LIT[Math.floor(hash(hh * 7 + m, z0) * LIT.length) % LIT.length][0];
              const w2 = where + (hash(m, hh) - 0.5) * 0.5, a2 = (hash(hh, m * 3 + 1) - 0.5) * 1.6;
              const mx = x0 + nx * sd * w2 + tx * a2, mz = z0 + nz * sd * w2 + tz * a2;
              put('lit:' + k2, mx, (w2 > hw ? surf(mx, mz, yr) : yr) + 0.007 + m * 0.001, mz, hash(mx, mz) * 6.3); out.litter++;
            }
          }
          // stains: oil in the lanes and gutters, old spills on the pavements
          if (hash(z0 * 0.37 + sd, x0 * 0.91) < (city ? 0.05 + downtown(x0, z0) * 0.08 : 0.04)) {
            const so = hash(x0, z0 * 3) < 0.6 ? hw * (0.25 + hash(z0, x0) * 0.55) : hw + 0.8 + hash(x0 * 2, z0) * 1.8;
            const sx = x0 + nx * sd * so, sz = z0 + nz * sd * so, k = 0.6 + hash(sx, sz) * 0.9;
            put('stain', sx, (so > hw ? surf(sx, sz, yr) : yr) + 0.005, sz, hash(sz, sx) * 6.3, k, 1, k * (0.7 + hash(sx, 1) * 0.6)); out.stains = (out.stains || 0) + 1;
          }
          // weeds in the crack between the pavement and the kerb (and the odd one in the gutter)
          const hw2 = hash(z0 * 1.9 + sd, x0 * 0.4);
          if (hw2 < (city ? 0.05 + (1 - downtown(x0, z0)) * 0.1 : 0.2)) {
            const off = hw2 < 0.03 ? hw - 0.12 : hw + 0.3, wx = x0 + nx * sd * off, wz = z0 + nz * sd * off;
            const wy = off > hw ? surf(wx, wz, yr) : yr;
            const k = 0.55 + hash(wx, wz) * 0.9;
            put('weed', wx, wy - 0.01, wz, hash(wz, wx) * 6.3, k, k * (0.7 + hw2 * 3), k); out.weeds++;
          }
        }
        // G14: the city pavement's furniture, just inside the kerb, closer together downtown
        if (city && g >= nextFurn) {
          nextFurn += 15 - downtown(x0, z0) * 6 + h * 6;
          furnSide = -furnSide; const sd = furnSide, off = hw + 0.95; // (both pavements, in turn)
          const fx = x0 + nx * sd * off, fz = z0 + nz * sd * off;
          const kk = hash(z0 * 0.53, x0 * 0.29), key = kk < 0.32 ? 'bench' : kk < 0.6 ? 'planter' : kk < 0.82 ? 'news' : 'bikerack';
          if (!blocked(fx, fz, key === 'planter' ? 0.75 : 1.0)) {
            put(key, fx, surf(fx, fz, yr), fz, Math.atan2(nx * sd, nz * sd)); // (fronts face the pavement)
            if (key === 'planter') collision.addCircle(fx, fz, 0.6);
            else for (const a of [-0.6, 0.6]) collision.addCircle(fx + tx * a, fz + tz * a, 0.3);
            out.furniture = (out.furniture || 0) + 1;
          }
        }
        // Mill Creek: hydrants at the kerb every ~85 m
        if (town && g >= nextHyd && (nextHyd += 85)) {
          const sd = h < 0.5 ? -1 : 1, x = x0 + nx * sd * (hw + 0.45), z = z0 + nz * sd * (hw + 0.45);
          if (!blocked(x, z, 0.3)) { put('hydrant', x, surf(x, z, yr), z, Math.atan2(-nx * sd, -nz * sd)); collision.addCircle(x, z, 0.2); out.hydrants++; }
        }
      }
      acc += L;
    }
  }
  // public bins on Mill Creek's corners
  for (const n of graph.nodes.values()) {
    if (n.id[0] !== 't' || !n.edges || n.edges.length < 3) continue;
    for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const x = n.x + sx * (TOWN.street / 2 + 1.0), z = n.z + sz * (TOWN.street / 2 + 1.0);
      if (blocked(x, z, 0.35)) continue;
      put('bin', x, surf(x, z, hm.height(x, z)), z, 0); collision.addCircle(x, z, 0.3); out.bins++;
    }
  }
  // weeds at the foot of walls and fences out in the poorer outskirts and the settlements
  if (yards?.weedSpots) for (const [x, z] of yards.weedSpots) { const k = 0.6 + hash(x, z) * 0.8; put('weed', x, hm.height(x, z) - 0.01, z, hash(z, x) * 6.3, k, k, k); out.weeds++; }

  // ---- meshes
  for (const [key, L] of lists) {
    if (!L.list.length) continue;
    const im = new THREE.InstancedMesh(L.make(), L.mat, L.list.length);
    const flat = key === 'manhole' || key === 'grate' || key === 'stain' || key.startsWith('lit:');
    im.castShadow = !flat && q.shadows > 0 && key !== 'weed'; im.receiveShadow = true; im.userData.noReflect = true; im.userData.noHit = flat || key === 'weed';
    if (flat) im.renderOrder = 1;
    const ni = nearInstances(im, L.list, key.startsWith('stop') || key.startsWith('name:') ? near * 1.6 : key === 'stain' ? near * 0.5 : flat || key === 'weed' ? near * 0.8 : near);
    ni.update(new THREE.Vector3(1e9, 0, 1e9), true);
    im.name = 'clutter:' + key;
    scene.add(im);
  }
  return out;
}
