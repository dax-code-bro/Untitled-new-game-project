// Opening hours (24h clock). Gulf Marts never close.
export const SHOP_HOURS = { city: [9, 19], town: [6, 18], bayou: [5, 19], 'c-city': [10, 21], 'c-town': [8, 18], 'c-bayou': [6, 19], 'a-city': [9, 19], 'a-town': [9, 17], auction: [9, 19] };
export const shopOpen = (id, hour) => { const h = SHOP_HOURS[id]; return !h || (hour >= h[0] && hour < h[1]); };
const ampm = (h) => (h === 12 ? '12 PM' : h > 12 ? `${h - 12} PM` : `${h} AM`);
export const closedText = (name, id) => { const h = SHOP_HOURS[id] || [9, 19]; return `${name} is closed. Open ${ampm(h[0])} – ${ampm(h[1])}.`; };

// What a shop looks like from the street. Every store picks a style, so no
// two read the same: brick with a parapet and barred windows, clapboard with a
// tin roof and a porch, stucco with a striped awning, a corrugated metal
// building with a roll-up door, a Quonset hut, a cinder-block corner store,
// or a civic hall with columns. Each gets a real glass door that swings open
// as you walk up, an OPEN sign in the window and the store hours.
import * as THREE from 'three';

const texCache = new Map();
function canvasTex(key, draw, rep = [2, 2]) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = c.height = 256; const x = c.getContext('2d');
  draw(x);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(...rep); t.anisotropy = 4;
  texCache.set(key, t); return t;
}
const hex = (n) => '#' + new THREE.Color(n).getHexString();
const shade = (n, k) => '#' + new THREE.Color(n).multiplyScalar(k).getHexString();

export function wallMaterial(st) {
  const base = st.wall || 0x8c7f6e, style = st.style || 'plain';
  let map = null;
  if (style === 'brick' || style === 'civic-brick') map = canvasTex('brick' + base, (x) => {
    x.fillStyle = '#b8b0a4'; x.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 16; r++) for (let c = -1; c < 5; c++) {
      const k = 0.82 + Math.random() * 0.3; x.fillStyle = shade(base, k);
      x.fillRect(c * 64 + (r % 2) * 32 + 2, r * 16 + 2, 60, 13);
    }
  }, [3, 2]);
  else if (style === 'siding') map = canvasTex('siding' + base, (x) => {
    for (let r = 0; r < 12; r++) { const g = x.createLinearGradient(0, r * 21.33, 0, (r + 1) * 21.33); g.addColorStop(0, shade(base, 1.06)); g.addColorStop(0.85, shade(base, 0.94)); g.addColorStop(1, shade(base, 0.6)); x.fillStyle = g; x.fillRect(0, r * 21.33, 256, 21.33); }
    x.globalAlpha = 0.08; for (let i = 0; i < 400; i++) { x.fillStyle = Math.random() < 0.5 ? '#000' : '#fff'; x.fillRect(Math.random() * 256, Math.random() * 256, 20 + Math.random() * 40, 1); }
  }, [3, 2]);
  else if (style === 'metal' || style === 'quonset') map = canvasTex('metal' + base, (x) => {
    for (let i = 0; i < 32; i++) { const g = x.createLinearGradient(i * 8, 0, (i + 1) * 8, 0); g.addColorStop(0, shade(base, 0.75)); g.addColorStop(0.5, shade(base, 1.12)); g.addColorStop(1, shade(base, 0.8)); x.fillStyle = g; x.fillRect(i * 8, 0, 8, 256); }
    x.globalAlpha = 0.12; for (let i = 0; i < 60; i++) { x.fillStyle = '#6b4a2a'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 10 + Math.random() * 30); }
  }, [4, 1]);
  else if (style === 'block') map = canvasTex('block' + base, (x) => {
    x.fillStyle = shade(base, 0.82); x.fillRect(0, 0, 256, 256);
    for (let r = 0; r < 8; r++) for (let c = -1; c < 3; c++) { x.fillStyle = shade(base, 0.95 + Math.random() * 0.08); x.fillRect(c * 128 + (r % 2) * 64 + 2, r * 32 + 2, 124, 29); }
  }, [3, 2]);
  else map = canvasTex('stucco' + base, (x) => {
    x.fillStyle = hex(base); x.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 3000; i++) { x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.06)'; x.fillRect(Math.random() * 256, Math.random() * 256, 2, 2); }
  }, [2, 2]);
  return new THREE.MeshStandardMaterial({ color: 0xffffff, map, roughness: style === 'metal' || style === 'quonset' ? 0.55 : 0.9, metalness: style === 'metal' || style === 'quonset' ? 0.45 : 0 });
}

function textTex(key, w, h, draw) {
  if (texCache.has(key)) return texCache.get(key);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); draw(x, w, h);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; texCache.set(key, t); return t;
}
const openSign = () => textTex('open', 256, 96, (x, w, h) => {
  x.fillStyle = '#000'; x.fillRect(0, 0, w, h);
  x.strokeStyle = '#3aa0ff'; x.lineWidth = 7; x.strokeRect(10, 10, w - 20, h - 20);
  x.fillStyle = '#ff3b3b'; x.font = 'bold 58px Impact, Oswald, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText('OPEN', w / 2, h / 2 + 3);
});
const hoursTex = (hours) => textTex('hours' + hours, 128, 160, (x, w, h) => {
  x.fillStyle = 'rgba(255,255,255,0.92)'; x.fillRect(0, 0, w, h);
  x.fillStyle = '#111'; x.font = 'bold 18px Inter, Arial, sans-serif'; x.textAlign = 'center'; x.fillText('HOURS', w / 2, 30);
  x.font = '14px Inter, Arial, sans-serif'; hours.split('|').forEach((l, i) => x.fillText(l, w / 2, 62 + i * 24));
});

// add the style's exterior to a shop group built by buildShop (local coords:
// front faces +z, footprint W x D, wall height H). Returns door leaves to animate.
export function dressStorefront(g, st, { W, D, H, t, box, M, hide }) {
  const style = st.style || 'plain';
  const trim = M(st.trim || 0x2b2420, 0.7), dark = M(0x1a1a1a, 0.6, 0.4), wood = M(0x6b4a2c, 0.75);
  const add = (geo, m, x, y, z, ry = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.rotation.y = ry; o.castShadow = o.receiveShadow = true; o.userData.noHit = true; g.add(o); return o; };
  const front = D / 2 + t / 2 + 0.01;
  if (style === 'brick' || style === 'civic-brick') {
    add(new THREE.BoxGeometry(W + 0.5, 0.8, 0.4), trim, 0, H + 0.4, D / 2 + 0.05); // parapet
    add(new THREE.BoxGeometry(W + 0.7, 0.14, 0.55), M(0xd8d0c0, 0.8), 0, H + 0.85, D / 2 + 0.05); // cornice
    if (st.bars) for (const s of [-1, 1]) for (let i = 0; i < 9; i++) add(new THREE.CylinderGeometry(0.012, 0.012, H - 1.9, 6), dark, s * (0.9 + (W - 1.8) / 4) + (i - 4) * 0.42, 0.9 + (H - 1.9) / 2, front + 0.04);
    hide('awning');
    add(new THREE.BoxGeometry(W + 0.4, 0.06, 1.2), dark, 0, 2.85, D / 2 + 0.6); // steel canopy
    for (const s of [-1, 1]) { const rod = add(new THREE.CylinderGeometry(0.015, 0.015, 1.6, 6), dark, s * (W / 2 - 0.4), 3.4, D / 2 + 0.6); rod.rotation.x = -0.75; }
  } else if (style === 'siding') {
    // pitched tin roof and a wooden porch
    hide('roof'); hide('awning');
    const tin = M(st.roof || 0x8a8f94, 0.45, 0.6);
    for (const s of [-1, 1]) { const r = add(new THREE.BoxGeometry(W + 1.2, 0.06, D / 2 + 0.9), tin, 0, H + 0.95, s * (D / 4 + 0.2)); r.rotation.x = s * -0.42; }
    const gable = new THREE.Shape(); gable.moveTo(-W / 2, 0); gable.lineTo(W / 2, 0); gable.lineTo(0, 1.95); gable.closePath();
    const gw = wallMaterial(st);
    for (const z of [D / 2, -D / 2]) add(new THREE.ShapeGeometry(gable), gw, 0, H, z + (z > 0 ? 0.16 : -0.16), z > 0 ? 0 : Math.PI);
    add(new THREE.BoxGeometry(W + 0.4, 0.14, 2.2), wood, 0, 0.07, D / 2 + 1.1); // porch deck
    add(new THREE.BoxGeometry(W + 0.6, 0.06, 2.4), tin, 0, 2.95, D / 2 + 1.2).rotation.x = 0.12; // porch roof
    for (const x of [-W / 2, -W / 6, W / 6, W / 2]) add(new THREE.CylinderGeometry(0.07, 0.07, 2.9, 8), wood, x * 0.97, 1.47, D / 2 + 2.15);
    if (st.porchProps) st.porchProps(add, M, W, D);
  } else if (style === 'stucco') {
    hide('awning');
    // striped fabric awning
    const stripe = textTex('stripe' + (st.awning || 0x2f7d74), 64, 64, (x) => { for (let i = 0; i < 8; i++) { x.fillStyle = i % 2 ? '#f2efe6' : hex(st.awning || 0x2f7d74); x.fillRect(i * 8, 0, 8, 64); } });
    stripe.wrapS = THREE.RepeatWrapping; stripe.repeat.set(6, 1);
    const aw = add(new THREE.BoxGeometry(W + 0.2, 0.04, 1.6), new THREE.MeshStandardMaterial({ map: stripe, roughness: 0.9, side: THREE.DoubleSide }), 0, 3.0, D / 2 + 0.75); aw.rotation.x = 0.32;
    add(new THREE.BoxGeometry(W + 0.3, 0.2, 0.3), M(0xf2efe6, 0.8), 0, H + 0.1, D / 2 + 0.05);
    for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.5, 0.9, 0.5), M(0xb8a890, 0.8), s * (W / 2 - 0.4), 0.45, D / 2 + 0.9); // planters
    for (const s of [-1, 1]) add(new THREE.SphereGeometry(0.42, 10, 8), M(0x3d6b35, 0.9), s * (W / 2 - 0.4), 1.1, D / 2 + 0.9);
  } else if (style === 'metal') {
    hide('awning');
    add(new THREE.BoxGeometry(3.2, 3.0, 0.12), M(0x7d8287, 0.5, 0.6), -W / 2 - 0.08, 1.5, 0, Math.PI / 2); // roll-up door on the side
    for (let i = 0; i < 12; i++) add(new THREE.BoxGeometry(0.02, 0.03, 3.1), dark, -W / 2 - 0.15, 0.2 + i * 0.24, 0);
    add(new THREE.BoxGeometry(0.16, 0.1, 0.22), M(0xeeeeee, 0.4), W / 2 - 0.3, H - 0.3, D / 2 + 0.25); // camera
    add(new THREE.BoxGeometry(W + 0.2, 0.3, 0.2), M(0x111111, 0.5), 0, H + 0.05, D / 2 + 0.15);
  } else if (style === 'block') {
    hide('awning');
    add(new THREE.BoxGeometry(W + 0.5, 0.9, 0.3), M(st.band || 0xb3241f, 0.5), 0, H - 0.15, D / 2 + 0.2); // fascia band
    add(new THREE.BoxGeometry(W + 0.5, 0.12, 0.32), M(0xf4c430, 0.5), 0, H - 0.65, D / 2 + 0.2);
    // ice machine and a propane cage out front
    add(new THREE.BoxGeometry(1.4, 1.6, 0.8), M(0xe8eef2, 0.4, 0.3), W / 2 - 1.2, 0.8, D / 2 + 0.6);
    add(new THREE.BoxGeometry(1.2, 0.3, 0.02), M(0x2a6fb5, 0.5), W / 2 - 1.2, 1.25, D / 2 + 1.01);
    add(new THREE.BoxGeometry(1.0, 1.3, 0.7), M(0x8a8f94, 0.5, 0.7), -W / 2 + 1.0, 0.65, D / 2 + 0.55);
    for (let i = 0; i < 4; i++) add(new THREE.CylinderGeometry(0.15, 0.15, 0.5, 10), M(0xf2f2f2, 0.5), -W / 2 + 0.7 + (i % 2) * 0.5, 0.3 + Math.floor(i / 2) * 0.55, D / 2 + 0.55);
    // window posters
    const poster = textTex('poster', 128, 192, (x) => { x.fillStyle = '#ffd400'; x.fillRect(0, 0, 128, 192); x.fillStyle = '#b3241f'; x.font = 'bold 34px Impact, sans-serif'; x.textAlign = 'center'; x.fillText('ICE', 64, 60); x.fillText('COLD', 64, 100); x.fillStyle = '#111'; x.font = 'bold 22px Impact'; x.fillText('2 FOR $3', 64, 150); });
    for (const s of [-1, 1]) add(new THREE.PlaneGeometry(0.7, 1.05), new THREE.MeshStandardMaterial({ map: poster, roughness: 0.8 }), s * (W / 2 - 1.3), 1.8, front + 0.03);
  } else if (style === 'quonset') {
    // a half-round corrugated hut wider than the shop box, with flat end walls
    hide('roof'); hide('awning'); hide('sides'); hide('back'); hide('front');
    const R = W / 2 + 0.25, top = H + 1.1;
    const shell = add(new THREE.CylinderGeometry(R, R, D + 0.3, 28, 1, true, -Math.PI / 2, Math.PI), wallMaterial(st), 0, 0, 0);
    shell.rotation.x = Math.PI / 2; shell.scale.set(1, 1, top / R); shell.material.side = THREE.DoubleSide;
    // end wall: the arch with a notch for the door (one simple polygon, no holes)
    const end = (notch) => {
      const sh = new THREE.Shape();
      if (notch) { sh.moveTo(0.9, 0); sh.lineTo(R, 0); } else sh.moveTo(R, 0);
      for (let i = 1; i <= 24; i++) { const a = (i / 24) * Math.PI; sh.lineTo(R * Math.cos(a), top * Math.sin(a)); }
      if (notch) { sh.lineTo(-0.9, 0); sh.lineTo(-0.9, 2.5); sh.lineTo(0.9, 2.5); }
      sh.closePath();
      return new THREE.ShapeGeometry(sh);
    };
    const endM = M(st.wall || 0x5d5a40, 0.7, 0.3); endM.side = THREE.DoubleSide;
    add(end(true), endM, 0, 0, D / 2 + 0.02);
    add(end(false), endM, 0, 0, -D / 2 - 0.02);
    // small windows either side of the door, and a canopy over it
    for (const s of [-1, 1]) {
      add(new THREE.PlaneGeometry(1.3, 0.9), new THREE.MeshStandardMaterial({ color: 0x223038, roughness: 0.1, metalness: 0.3 }), s * 2.6, 1.8, D / 2 + 0.04);
      add(new THREE.BoxGeometry(1.4, 1.0, 0.04), M(0x2a2a20, 0.6), s * 2.6, 1.8, D / 2 + 0.03);
    }
    add(new THREE.BoxGeometry(2.4, 0.08, 1.2), M(0x3a3a2a, 0.8), 0, 2.85, D / 2 + 0.6);
  } else if (style === 'civic') {
    hide('awning');
    add(new THREE.BoxGeometry(W + 0.6, 0.5, 2.8), M(0xd8d2c4, 0.85), 0, 0.25, D / 2 + 1.3); // steps
    add(new THREE.BoxGeometry(W - 1.5, 0.25, 0.6), M(0xd8d2c4, 0.85), 0, 0.12, D / 2 + 2.9);
    for (const x of [-3.6, -1.4, 1.4, 3.6]) add(new THREE.CylinderGeometry(0.25, 0.3, H, 14), M(0xece6d8, 0.7), x, H / 2 + 0.5, D / 2 + 2.0);
    const ped = new THREE.Shape(); ped.moveTo(-W / 2 - 0.3, 0); ped.lineTo(W / 2 + 0.3, 0); ped.lineTo(0, 1.6); ped.closePath();
    add(new THREE.ExtrudeGeometry(ped, { depth: 2.8, bevelEnabled: false }), M(0xece6d8, 0.75), 0, H + 0.5, D / 2 - 0.4);
    add(new THREE.BoxGeometry(W + 0.6, 0.35, 2.9), M(0xd8d2c4, 0.8), 0, H + 0.5, D / 2 + 1.0);
    const pole = add(new THREE.CylinderGeometry(0.05, 0.06, 8, 8), M(0xcccccc, 0.3, 0.9), W / 2 + 1.5, 4, D / 2 + 2.5);
    const flag = textTex('flag', 96, 64, (x) => { for (let i = 0; i < 7; i++) { x.fillStyle = i % 2 ? '#ffffff' : '#b22234'; x.fillRect(0, i * 9.2, 96, 9.2); } x.fillStyle = '#3c3b6e'; x.fillRect(0, 0, 40, 32); });
    add(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ map: flag, side: THREE.DoubleSide, roughness: 0.9 }), W / 2 + 2.27, 7.4, D / 2 + 2.5);
    void pole;
  }
  // the door: two glass leaves hinged at the frame, and an OPEN sign + hours
  const glassM = new THREE.MeshStandardMaterial({ color: 0x9fb8c8, roughness: 0.05, metalness: 0.2, transparent: true, opacity: 0.35 });
  const frameM = M(st.doorFrame || 0x2a2a2a, 0.4, 0.6);
  const leaves = [];
  for (const s of [-1, 1]) {
    const pivot = new THREE.Group(); pivot.position.set(s * 0.9, 0, D / 2 + 0.02); g.add(pivot);
    const leaf = new THREE.Group(); pivot.add(leaf);
    const pane = new THREE.Mesh(new THREE.BoxGeometry(0.86, 2.3, 0.02), glassM); pane.position.set(-s * 0.45, 1.2, 0); leaf.add(pane);
    for (const [w, h, x, y] of [[0.9, 0.06, -s * 0.45, 2.37], [0.9, 0.12, -s * 0.45, 0.06], [0.05, 2.4, -s * 0.03, 1.2], [0.05, 2.4, -s * 0.87, 1.2]]) { const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.05), frameM); f.position.set(x, y, 0); leaf.add(f); }
    const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.5, 6), M(0xc0c4c8, 0.3, 0.9)); bar.position.set(-s * 0.75, 1.1, 0.06); leaf.add(bar);
    if (s < 0) { const hp = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.28), new THREE.MeshBasicMaterial({ map: hoursTex(st.hours || 'Mon–Sat 8–8|Sunday 10–6'), transparent: true })); hp.position.set(-s * 0.45, 1.45, 0.02); leaf.add(hp); }
    leaf.traverse((o) => { if (o.isMesh) o.userData.noHit = true; });
    leaves.push({ pivot, s });
  }
  const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.26), new THREE.MeshStandardMaterial({ map: openSign(), emissive: 0xffffff, emissiveMap: openSign(), emissiveIntensity: 1.4 }));
  sign.position.set(-(0.9 + (W - 1.8) / 4), 2.15, D / 2 - 0.06); sign.userData.noHit = true; g.add(sign);
  if (style === 'quonset') sign.position.set(-2.6, 1.8, D / 2 + 0.06);
  return { leaves, sign };
}
