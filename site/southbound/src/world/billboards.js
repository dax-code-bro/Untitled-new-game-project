// Billboards along the highways and country roads: steel posts, a catwalk,
// two lamps that come on at night, and ads for local (made-up) businesses:
// the lawyer, the used-truck lot, the crawfish place, the sheriff's
// re-election, a lost dog... Drawn on canvases. Structures share one merged
// mesh; each ad is one mesh, so the lot costs a couple of dozen draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CITY, TOWN } from './layout.js';

const ADS = [
  { bg: ['#0e0e0e', '#1d1d1d'], fg: '#4fe08a', title: 'RUNR', sub: 'Anything. Anywhere. Fast.', foot: 'Order on your phone · guns · food · towing', logo: 'runr' },
  { bg: ['#16120e', '#2c2218'], fg: '#e8d3a8', title: 'CALVERA ARMS EXCHANGE', sub: 'The largest selection in the state', foot: 'Downtown Port Calvera · Licensed dealer', logo: 'target' },
  { bg: ['#1b2f5c', '#0f1d3a'], fg: '#ffd84a', title: 'ARRESTED? INJURED?', sub: 'CALL DUKE LAFLEUR', foot: 'Attorney at law · 1-800-555-DUKE · Se habla español', logo: 'phone' },
  { bg: ['#9b1510', '#6a0d0a'], fg: '#ffffff', title: 'GULF MART', sub: 'Open 24 hours · Hot boudin · Cold drinks', foot: 'Next exit', logo: 'arrow' },
  { bg: ['#f4c430', '#e09a10'], fg: '#1a1a1a', title: 'BIG AL\'S USED TRUCKS', sub: 'We finance ANYONE. Even you.', foot: 'Hwy 9 · No credit, bad credit, no problem', logo: 'truck' },
  { bg: ['#c8341c', '#8e1f10'], fg: '#fff2d0', title: 'CRAWFISH KING', sub: 'All you can eat Fridays', foot: 'Boiled spicy since 1974', logo: 'crawfish' },
  { bg: ['#0b5f8a', '#063d5a'], fg: '#ffffff', title: 'PELICAN COLA', sub: 'The taste of the Gulf', foot: 'Ice cold at your corner store', logo: 'bubbles' },
  { bg: ['#f2efe6', '#d8d2c2'], fg: '#1d2a44', title: 'RE-ELECT SHERIFF DUPREE', sub: 'Tough on crime. Easy on taxes.', foot: 'Paid for by Friends of Dupree', logo: 'star' },
  { bg: ['#2e3b1f', '#1c2512'], fg: '#e9e1b8', title: 'BOUDREAUX TRADING POST', sub: 'Shells by the box · Bait · Boots', foot: 'Down in the bayou · Cash only', logo: 'target' },
  { bg: ['#13262a', '#0b1719'], fg: '#9fc4c0', title: 'CALVERA OUTFITTERS', sub: '13,500 ways to look good', foot: 'Downtown · Mill Creek Dry Goods · Bayou Bait & Boots', logo: 'shirt' },
  { bg: ['#1f4a33', '#123021'], fg: '#f1e9c8', title: 'FIRST GULF BANK', sub: 'Safer than under the mattress.', foot: 'Member FDIC', logo: 'bank' },
  { bg: ['#ffffff', '#efefef'], fg: '#c01818', title: 'HAVE YOU SEEN BISCUIT?', sub: 'Small brown dog · answers to "Biscuit"', foot: 'REWARD · call Mrs. Arceneaux 555-0142', logo: 'dog' },
  { bg: ['#2a6f9a', '#174a6a'], fg: '#ffffff', title: 'LAKE CALVERA MARINA', sub: 'Boats · Bait · Fuel · Charters', foot: 'Follow the signs to the water', logo: 'boat' },
  { bg: ['#5a2d78', '#331848'], fg: '#ffe35a', title: 'CALVERA LOTTERY', sub: 'Somebody\'s gotta win.', foot: 'JACKPOT $4.2 MILLION · Play responsibly', logo: 'star' },
  { bg: ['#e88b4a', '#b25a20'], fg: '#1a1208', title: 'BAYOU AIR TOURS', sub: 'See it all from above', foot: 'Calvera Airfield · Daily flights', logo: 'plane' },
  { bg: ['#30353a', '#1e2124'], fg: '#ff9a3a', title: 'THIBODEAUX TOWING', sub: 'Stuck? Sunk? Stolen? We\'ll find it.', foot: '24/7 · land and water recovery', logo: 'truck' },
];

function drawLogo(x, kind, cx, cy, r, fg) {
  x.save(); x.fillStyle = fg; x.strokeStyle = fg; x.lineWidth = r * 0.12;
  if (kind === 'target') { for (let i = 3; i > 0; i--) { x.beginPath(); x.arc(cx, cy, r * i / 3, 0, 7); x.stroke(); } x.beginPath(); x.arc(cx, cy, r * 0.12, 0, 7); x.fill(); }
  else if (kind === 'runr') { x.beginPath(); x.moveTo(cx - r, cy + r * 0.6); x.lineTo(cx + r * 0.2, cy - r * 0.6); x.lineTo(cx + r * 0.2, cy); x.lineTo(cx + r, cy - r * 0.2); x.lineTo(cx - r * 0.2, cy + r * 0.8); x.lineTo(cx - r * 0.2, cy + r * 0.2); x.closePath(); x.fill(); }
  else if (kind === 'phone') { x.beginPath(); x.roundRect(cx - r * 0.45, cy - r * 0.8, r * 0.9, r * 1.6, r * 0.15); x.stroke(); x.fillRect(cx - r * 0.1, cy + r * 0.55, r * 0.2, r * 0.1); }
  else if (kind === 'arrow') { x.beginPath(); x.moveTo(cx - r, cy - r * 0.3); x.lineTo(cx + r * 0.2, cy - r * 0.3); x.lineTo(cx + r * 0.2, cy - r * 0.8); x.lineTo(cx + r, cy); x.lineTo(cx + r * 0.2, cy + r * 0.8); x.lineTo(cx + r * 0.2, cy + r * 0.3); x.lineTo(cx - r, cy + r * 0.3); x.closePath(); x.fill(); }
  else if (kind === 'truck') { x.fillRect(cx - r, cy - r * 0.3, r * 1.2, r * 0.6); x.fillRect(cx + r * 0.25, cy - r * 0.1, r * 0.75, r * 0.4); for (const wx of [-0.6, 0.6]) { x.beginPath(); x.arc(cx + wx * r, cy + r * 0.35, r * 0.25, 0, 7); x.fill(); } }
  else if (kind === 'crawfish') { x.beginPath(); x.ellipse(cx, cy, r * 0.35, r * 0.8, 0, 0, 7); x.fill(); for (const s of [-1, 1]) { x.beginPath(); x.ellipse(cx + s * r * 0.55, cy - r * 0.75, r * 0.2, r * 0.32, s * 0.5, 0, 7); x.fill(); } }
  else if (kind === 'bubbles') { for (const [dx, dy, rr] of [[0, 0, 0.5], [0.5, -0.5, 0.3], [-0.45, -0.6, 0.22], [0.3, 0.6, 0.2]]) { x.beginPath(); x.arc(cx + dx * r, cy + dy * r, rr * r, 0, 7); x.stroke(); } }
  else if (kind === 'star') { x.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.42 : r; x.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } x.closePath(); x.fill(); }
  else if (kind === 'shirt') { x.beginPath(); x.moveTo(cx - r * 0.4, cy - r * 0.8); x.lineTo(cx - r, cy - r * 0.4); x.lineTo(cx - r * 0.75, cy); x.lineTo(cx - r * 0.5, cy - r * 0.15); x.lineTo(cx - r * 0.5, cy + r * 0.8); x.lineTo(cx + r * 0.5, cy + r * 0.8); x.lineTo(cx + r * 0.5, cy - r * 0.15); x.lineTo(cx + r * 0.75, cy); x.lineTo(cx + r, cy - r * 0.4); x.lineTo(cx + r * 0.4, cy - r * 0.8); x.quadraticCurveTo(cx, cy - r * 0.45, cx - r * 0.4, cy - r * 0.8); x.fill(); }
  else if (kind === 'bank') { x.beginPath(); x.moveTo(cx - r, cy - r * 0.3); x.lineTo(cx, cy - r); x.lineTo(cx + r, cy - r * 0.3); x.closePath(); x.fill(); for (let i = -2; i <= 2; i++) x.fillRect(cx + i * r * 0.4 - r * 0.08, cy - r * 0.2, r * 0.16, r * 0.8); x.fillRect(cx - r, cy + r * 0.65, r * 2, r * 0.18); }
  else if (kind === 'dog') { x.beginPath(); x.ellipse(cx, cy + r * 0.2, r * 0.7, r * 0.4, 0, 0, 7); x.fill(); x.beginPath(); x.arc(cx + r * 0.7, cy - r * 0.25, r * 0.3, 0, 7); x.fill(); for (const lx of [-0.5, -0.2, 0.3, 0.55]) x.fillRect(cx + lx * r, cy + r * 0.4, r * 0.12, r * 0.45); x.beginPath(); x.ellipse(cx + r * 0.62, cy - r * 0.55, r * 0.1, r * 0.2, -0.4, 0, 7); x.fill(); }
  else if (kind === 'boat') { x.beginPath(); x.moveTo(cx - r, cy + r * 0.1); x.lineTo(cx + r, cy + r * 0.1); x.lineTo(cx + r * 0.6, cy + r * 0.6); x.lineTo(cx - r * 0.7, cy + r * 0.6); x.closePath(); x.fill(); x.fillRect(cx - r * 0.05, cy - r * 0.9, r * 0.1, r); x.beginPath(); x.moveTo(cx + r * 0.1, cy - r * 0.85); x.lineTo(cx + r * 0.75, cy); x.lineTo(cx + r * 0.1, cy); x.fill(); }
  else if (kind === 'plane') { x.fillRect(cx - r, cy - r * 0.1, r * 2, r * 0.2); x.fillRect(cx - r * 0.15, cy - r * 0.8, r * 0.3, r * 1.6); x.fillRect(cx - r * 0.95, cy - r * 0.4, r * 0.15, r * 0.8); }
  x.restore();
}

function adTexture(ad, worn) {
  const c = document.createElement('canvas'); c.width = 1024; c.height = 352;
  const x = c.getContext('2d');
  const gr = x.createLinearGradient(0, 0, 0, 352); gr.addColorStop(0, ad.bg[0]); gr.addColorStop(1, ad.bg[1]);
  x.fillStyle = gr; x.fillRect(0, 0, 1024, 352);
  drawLogo(x, ad.logo, 150, 176, 95, ad.fg);
  x.fillStyle = ad.fg; x.textBaseline = 'alphabetic';
  const fit = (t, size, maxW, weight = 'bold') => { let s = size; do { x.font = `${weight} ${s}px Impact, Oswald, 'Arial Narrow', sans-serif`; s -= 2; } while (x.measureText(t).width > maxW && s > 14); };
  fit(ad.title, 96, 720); x.fillText(ad.title, 280, 140);
  fit(ad.sub, 54, 720, '600'); x.globalAlpha = 0.92; x.fillText(ad.sub, 282, 215);
  fit(ad.foot, 30, 720, '500'); x.globalAlpha = 0.75; x.fillText(ad.foot, 284, 290); x.globalAlpha = 1;
  if (worn) { // sun-bleached and peeling at the edges
    x.globalCompositeOperation = 'source-atop';
    for (let i = 0; i < 260; i++) { x.fillStyle = `rgba(240,235,220,${Math.random() * 0.25})`; const px = Math.random() * 1024, py = Math.random() * 352; x.fillRect(px, py, 4 + Math.random() * 40, 2 + Math.random() * 10); }
    x.fillStyle = 'rgba(255,250,235,0.12)'; x.fillRect(0, 0, 1024, 352);
    x.globalCompositeOperation = 'source-over';
    for (let i = 0; i < 6; i++) { x.fillStyle = '#c9c3b4'; const px = Math.random() < 0.5 ? Math.random() * 60 : 964 + Math.random() * 60; x.beginPath(); x.moveTo(px, Math.random() * 352); x.lineTo(px + 40, Math.random() * 352); x.lineTo(px + 10, Math.random() * 352); x.fill(); }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createBillboards(scene, graph, hm, collision, q) {
  const max = q.label === 'Phone' ? 12 : 26;
  let s = 913; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const inTown = (x, z) => (x > CITY.x0 - 60 && x < CITY.x0 + CITY.nx * CITY.pitch + 60 && z > CITY.z0 - 60 && z < CITY.z0 + CITY.nz * CITY.pitch + 60) || (x > TOWN.x0 - 50 && x < TOWN.x0 + TOWN.nx * TOWN.pitch + 50 && z > TOWN.z0 - 50 && z < TOWN.z0 + TOWN.nz * TOWN.pitch + 50);
  const spots = [];
  const edges = graph.edges.filter((e) => e.pts.length > 3).sort((a, b) => (b.kind === 'highway') - (a.kind === 'highway'));
  for (let pass = 0; pass < 3 && spots.length < max; pass++) {
    for (const e of edges) {
      if (spots.length >= max) break;
      const i = 1 + ((rnd() * (e.pts.length - 2)) | 0);
      const [ax, az] = e.pts[i - 1], [bx, bz] = e.pts[i];
      const dx = bx - ax, dz = bz - az, L = Math.hypot(dx, dz) || 1, tx = dx / L, tz = dz / L;
      const side = rnd() < 0.5 ? 1 : -1, off = (e.width || 8) / 2 + 9;
      const x = ax + (-tz) * side * off, z = az + tx * side * off;
      if (inTown(x, z) || spots.some((p) => Math.hypot(p.x - x, p.z - z) < 260)) continue;
      const y = hm.height(x, z);
      if (y < hm.waterLevel(x, z) + 0.5) continue;
      let blocked = false;
      collision.query(x, z, 8, (it) => { if (it.t === 0 && x > it.minX - 6 && x < it.maxX + 6 && z > it.minZ - 6 && z < it.maxZ + 6) blocked = true; });
      if (blocked) continue;
      // face the traffic: turned towards the road, angled a little
      const yaw = Math.atan2(tz * side, -tx * side) + side * 0.3;
      spots.push({ x, z, y, yaw, ad: spots.length % ADS.length, worn: rnd() < 0.35 });
    }
  }
  if (!spots.length) return { update() {}, count: 0 };
  const steel = [], decks = [], boards = {}, lamps = [];
  const W = 9, Hb = 3.1, up = 4.6;
  const m4 = new THREE.Matrix4(), qq = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0);
  for (const sp of spots) {
    qq.setFromAxisAngle(Y, sp.yaw);
    const at = (lx, ly, lz) => new THREE.Vector3(lx, ly, lz).applyQuaternion(qq).add(new THREE.Vector3(sp.x, sp.y, sp.z));
    const put = (geo, list, lx, ly, lz) => { m4.compose(at(lx, ly, lz), qq, new THREE.Vector3(1, 1, 1)); list.push(geo.clone().applyMatrix4(m4)); };
    for (const px of [-W * 0.28, W * 0.28]) put(new THREE.CylinderGeometry(0.16, 0.2, up + 1.5, 8).translate(0, (up + 1.5) / 2 - 1, 0), steel, px, 0, 0);
    put(new THREE.BoxGeometry(W + 0.3, Hb + 0.3, 0.18), steel, 0, up + Hb / 2, -0.05);
    put(new THREE.BoxGeometry(W + 0.4, 0.08, 0.9), decks, 0, up - 0.25, 0.5);
    put(new THREE.BoxGeometry(W + 0.4, 0.05, 0.05), decks, 0, up + 0.65, 0.92);
    for (const lx of [-W * 0.3, W * 0.3]) { put(new THREE.BoxGeometry(0.08, 0.08, 1.1), steel, lx, up - 0.2, 0.6); put(new THREE.BoxGeometry(0.4, 0.14, 0.25), steel, lx, up - 0.18, 1.15); lamps.push(at(lx, up - 0.3, 1.15)); }
    const plane = new THREE.PlaneGeometry(W, Hb); m4.compose(at(0, up + Hb / 2, 0.05), qq, new THREE.Vector3(1, 1, 1)); plane.applyMatrix4(m4);
    const k = sp.ad + (sp.worn ? 100 : 0);
    (boards[k] = boards[k] || []).push(plane);
    collision.addCircle?.(at(-W * 0.28, 0, 0).x, at(-W * 0.28, 0, 0).z, 0.25);
    collision.addCircle?.(at(W * 0.28, 0, 0).x, at(W * 0.28, 0, 0).z, 0.25);
  }
  const group = new THREE.Group();
  const steelM = new THREE.MeshStandardMaterial({ color: 0x6d7074, roughness: 0.6, metalness: 0.7 });
  const deckM = new THREE.MeshStandardMaterial({ color: 0x3e4246, roughness: 0.75, metalness: 0.5 });
  const sm = new THREE.Mesh(mergeGeometries(steel), steelM); sm.castShadow = true; sm.receiveShadow = true; sm.userData.hitStatic = true; group.add(sm);
  const dm = new THREE.Mesh(mergeGeometries(decks), deckM); dm.castShadow = true; group.add(dm);
  const adMats = [];
  for (const [k, list] of Object.entries(boards)) {
    const ad = ADS[k % 100], tex = adTexture(ad, k >= 100);
    const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.75, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0 });
    adMats.push(m);
    const mesh = new THREE.Mesh(mergeGeometries(list), m); mesh.receiveShadow = true; mesh.userData.hitStatic = true; group.add(mesh);
  }
  // lamp heads glow at night
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff1c8 });
  const lampGeo = mergeGeometries(lamps.map((p) => new THREE.BoxGeometry(0.3, 0.04, 0.18).translate(p.x, p.y, p.z)));
  const lampMesh = new THREE.Mesh(lampGeo, glow); lampMesh.visible = false; group.add(lampMesh);
  scene.add(group);
  let lit = -1;
  return {
    count: spots.length, spots,
    update(hour) {
      const night = hour < 6.3 || hour > 19.2 ? 1 : 0;
      if (night === lit) return;
      lit = night;
      for (const m of adMats) m.emissiveIntensity = night ? 0.55 : 0;
      lampMesh.visible = !!night;
    },
  };
}
