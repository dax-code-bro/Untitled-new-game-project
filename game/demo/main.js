// UNTITLED — First Demo (vertical slice) — "CoD1 milestone" build
// Three.js FPS: textured world (all textures painted procedurally on canvas — no assets),
// modeled gun viewmodels with animations (bob/sway/recoil/reload/muzzle flash/shells),
// soldier models with death animations, ADS, KB+mouse + controller + touch,
// nameplate system, friendly-fire lockout, story intro.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ---------------------------------------------------------------- crash visibility (mobile debugging)
function showFatal(msg) {
  let b = document.getElementById('fatal');
  if (!b) {
    b = document.createElement('div');
    b.id = 'fatal';
    b.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:99;background:#7a1226;color:#fff;font:12px monospace;padding:10px 14px;white-space:pre-wrap;';
    document.body.appendChild(b);
  }
  b.textContent = '⚠ GAME ERROR (send this to Claude):\n' + msg;
}
window.addEventListener('error', (e) => showFatal((e.message || 'unknown') + '\n' + (e.filename || '') + ':' + (e.lineno || '')));
window.addEventListener('unhandledrejection', (e) => showFatal('Promise: ' + (e.reason && e.reason.message || e.reason)));

(() => {
  const ok = document.createElement('div');
  ok.id = 'jsok';
  ok.style.cssText = 'position:fixed;left:8px;bottom:6px;z-index:98;color:#a6e3a1;font:10px monospace;opacity:.7;';
  ok.textContent = 'js: loading…';
  document.body.appendChild(ok);
})();

// ---------------------------------------------------------------- setup
const app = document.getElementById('app');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;                     // real shadows
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;    // filmic tone curve
renderer.toneMappingExposure = 1.05;
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();

const BASE_FOV = 75, ADS_FOV = 58;
const camera = new THREE.PerspectiveCamera(BASE_FOV, innerWidth / innerHeight, 0.1, 600);
const PLAYER_H = 1.7, CROUCH_H = 1.0;
camera.position.set(0, PLAYER_H, 8);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- procedural textures (painted in code)
function canvasTex(size, painter, rx = 1, ry = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d');
  painter(ctx, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(rx, ry);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
const rnd = (a, b) => a + Math.random() * (b - a);

// dirt ground with grass patches + stones (Colombia village floor)
const dirtTex = canvasTex(512, (ctx, s) => {
  ctx.fillStyle = '#6d5a41'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {           // soil noise
    ctx.fillStyle = `rgba(${rnd(70, 125) | 0},${rnd(55, 100) | 0},${rnd(35, 70) | 0},${rnd(0.15, 0.5)})`;
    ctx.fillRect(rnd(0, s), rnd(0, s), rnd(1, 3), rnd(1, 3));
  }
  for (let i = 0; i < 60; i++) {             // grass patches
    const x = rnd(0, s), y = rnd(0, s), r = rnd(8, 34);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${rnd(60, 90) | 0},${rnd(95, 130) | 0},50,0.55)`);
    g.addColorStop(1, 'rgba(80,110,50,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
  for (let i = 0; i < 140; i++) {            // stones
    ctx.fillStyle = `rgba(${rnd(120, 160) | 0},${rnd(115, 150) | 0},${rnd(105, 140) | 0},${rnd(0.4, 0.9)})`;
    ctx.beginPath(); ctx.ellipse(rnd(0, s), rnd(0, s), rnd(1, 4), rnd(1, 3), rnd(0, 3), 0, 7); ctx.fill();
  }
}, 26, 26);

// plaster wall w/ stains, cracks and painted windows
function wallTexture(base, trim) {
  return canvasTex(512, (ctx, s) => {
    ctx.fillStyle = base; ctx.fillRect(0, 0, s, s);
    for (let i = 0; i < 5000; i++) {         // stucco noise
      ctx.fillStyle = `rgba(0,0,0,${rnd(0.02, 0.09)})`;
      ctx.fillRect(rnd(0, s), rnd(0, s), rnd(1, 3), rnd(1, 2));
    }
    for (let i = 0; i < 12; i++) {           // grime streaks from top
      const x = rnd(0, s);
      const g = ctx.createLinearGradient(0, 0, 0, rnd(60, 200));
      g.addColorStop(0, 'rgba(40,35,30,0.25)'); g.addColorStop(1, 'rgba(40,35,30,0)');
      ctx.fillStyle = g; ctx.fillRect(x, 0, rnd(6, 22), 200);
    }
    // windows (2 rows)
    for (let row = 0; row < 2; row++) for (let col = 0; col < 3; col++) {
      const wx = 60 + col * 150, wy = 90 + row * 220, ww = 78, wh = 110;
      ctx.fillStyle = trim; ctx.fillRect(wx - 8, wy - 8, ww + 16, wh + 16);      // frame
      const g = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);              // glass
      g.addColorStop(0, '#232c34'); g.addColorStop(0.5, '#3a4a55'); g.addColorStop(1, '#1c2329');
      ctx.fillStyle = g; ctx.fillRect(wx, wy, ww, wh);
      ctx.strokeStyle = trim; ctx.lineWidth = 5;
      ctx.strokeRect(wx, wy, ww, wh);
      ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh);
      ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
    }
    // crack lines
    ctx.strokeStyle = 'rgba(30,25,20,0.35)'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      let x = rnd(0, s), y = 0;
      ctx.moveTo(x, y);
      while (y < s) { x += rnd(-14, 14); y += rnd(18, 45); ctx.lineTo(x, y); }
      ctx.stroke();
    }
  });
}
const wallTexA = wallTexture('#b8a284', '#4a3b2c');
const wallTexB = wallTexture('#a49478', '#3c3128');
const wallTexC = wallTexture('#8f8a7a', '#2f2a24');

// brick
const brickTex = canvasTex(512, (ctx, s) => {
  ctx.fillStyle = '#5f5148'; ctx.fillRect(0, 0, s, s);   // mortar
  const bh = 32, bw = 84;
  for (let row = 0; row < s / bh; row++) {
    const off = (row % 2) * (bw / 2);
    for (let col = -1; col < s / bw + 1; col++) {
      ctx.fillStyle = `rgb(${rnd(115, 150) | 0},${rnd(58, 76) | 0},${rnd(44, 58) | 0})`;
      ctx.fillRect(col * bw + off + 3, row * bh + 3, bw - 6, bh - 6);
      for (let i = 0; i < 24; i++) {
        ctx.fillStyle = `rgba(0,0,0,${rnd(0.03, 0.12)})`;
        ctx.fillRect(col * bw + off + rnd(3, bw - 6), row * bh + rnd(3, bh - 6), 2, 2);
      }
    }
  }
}, 3, 2);

// wood planks
const woodTex = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#8a6a42'; ctx.fillRect(0, 0, s, s);
  for (let p = 0; p < 4; p++) {
    ctx.fillStyle = `rgb(${rnd(125, 155) | 0},${rnd(92, 112) | 0},${rnd(55, 70) | 0})`;
    ctx.fillRect(0, p * 64 + 2, s, 60);
    ctx.strokeStyle = 'rgba(70,50,28,0.6)';
    for (let i = 0; i < 7; i++) {            // grain
      ctx.beginPath();
      const y = p * 64 + rnd(6, 58);
      ctx.moveTo(0, y);
      for (let x = 0; x < s; x += 22) ctx.lineTo(x, y + rnd(-2.5, 2.5));
      ctx.stroke();
    }
  }
  ctx.fillStyle = 'rgba(45,30,15,0.9)';       // nails
  [20, 236].forEach(x => { for (let p = 0; p < 4; p++) { ctx.beginPath(); ctx.arc(x, p * 64 + 32, 3, 0, 7); ctx.fill(); } });
});

// gunmetal
const metalTex = canvasTex(256, (ctx, s) => {
  ctx.fillStyle = '#2a2d31'; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 1600; i++) {
    ctx.fillStyle = `rgba(${rnd(50, 90) | 0},${rnd(52, 92) | 0},${rnd(55, 95) | 0},${rnd(0.05, 0.2)})`;
    ctx.fillRect(rnd(0, s), rnd(0, s), rnd(6, 30), 1);
  }
});

// camo fabric
function camoTex(c1, c2, c3) {
  return canvasTex(256, (ctx, s) => {
    ctx.fillStyle = c1; ctx.fillRect(0, 0, s, s);
    [c2, c3].forEach(c => {
      ctx.fillStyle = c;
      for (let i = 0; i < 26; i++) {
        ctx.beginPath();
        const x = rnd(0, s), y = rnd(0, s);
        ctx.moveTo(x, y);
        for (let a = 0; a < 6.3; a += 0.8) {
          const r = rnd(10, 30);
          ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
      }
    });
  });
}
const camoGreen = camoTex('#4a5a3a', '#2f3d27', '#6b6f4d');
const camoBlack = camoTex('#23262b', '#15171b', '#33373e');

// sky dome — overcast-blue with painted clouds
const skyTex = canvasTex(1024, (ctx, s) => {
  const g = ctx.createLinearGradient(0, 0, 0, s);
  g.addColorStop(0, '#7fa6c9'); g.addColorStop(0.45, '#a7c2d8'); g.addColorStop(0.75, '#cfd8d6'); g.addColorStop(1, '#d8d3c2');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  for (let i = 0; i < 90; i++) {             // cloud blobs
    const x = rnd(0, s), y = rnd(s * 0.1, s * 0.6), r = rnd(20, 90);
    const cg = ctx.createRadialGradient(x, y, 0, x, y, r);
    cg.addColorStop(0, `rgba(255,255,255,${rnd(0.10, 0.30)})`);
    cg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
  }
});

// ---------------------------------------------------------------- sky, fog, lights (daylight — CoD1 palette)
scene.background = new THREE.Color(0xa7c2d8);
scene.fog = new THREE.Fog(0xb6c4c9, 45, 190);
const skyDome = new THREE.Mesh(new THREE.SphereGeometry(280, 24, 14),
  new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false }));
scene.add(skyDome);

scene.add(new THREE.HemisphereLight(0xbfd0e0, 0x6b5f48, 0.9));
const sun = new THREE.DirectionalLight(0xfff1d6, 1.25);
sun.position.set(18, 30, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -60; sun.shadow.camera.right = 60;
sun.shadow.camera.top = 60; sun.shadow.camera.bottom = -60;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 120;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(new THREE.AmbientLight(0x8797a5, 0.35));

// environment cube (painted sky gradient) — gives metals REAL reflections
const envFaces = [];
for (let i = 0; i < 6; i++) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 64);
  if (i === 2) { g.addColorStop(0, '#8fb2d4'); g.addColorStop(1, '#a7c2d8'); }        // up
  else if (i === 3) { g.addColorStop(0, '#6d5a41'); g.addColorStop(1, '#54452f'); }   // down
  else { g.addColorStop(0, '#7fa6c9'); g.addColorStop(0.7, '#cfd8d6'); g.addColorStop(1, '#8a7a5c'); }
  x.fillStyle = g; x.fillRect(0, 0, 64, 64);
  envFaces.push(c);
}
const envTex = new THREE.CubeTexture(envFaces);
envTex.needsUpdate = true;
envTex.colorSpace = THREE.SRGBColorSpace;
scene.environment = envTex;

// ---------------------------------------------------------------- ground
const ground = new THREE.Mesh(new THREE.PlaneGeometry(240, 240),
  new THREE.MeshStandardMaterial({ map: dirtTex, roughness: 1, metalness: 0 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

// ---------------------------------------------------------------- village buildings + props (collidable)
const buildings = [];
const wallMats = [wallTexA, wallTexB, wallTexC, brickTex];
function makeBuilding(x, z, w, h, d, i) {
  const tex = wallMats[i % wallMats.length];
  const wall = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });
  const roof = new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 1 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wall, wall, roof, roof, wall, wall]);
  mesh.position.set(x, h / 2, z);
  mesh.rotation.y = (i % 4) * 0.12 - 0.18;
  mesh.castShadow = true; mesh.receiveShadow = true;
  scene.add(mesh);
  if (i % 3 === 0) {
    // pyramid roof (triangles!) on every third building
    const pyr = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.72, 1.6 + (i % 2), 4),
      new THREE.MeshStandardMaterial({ color: 0x7a3b2e, roughness: 0.9 }));
    pyr.position.set(x, h + 0.8, z); pyr.rotation.y = mesh.rotation.y + Math.PI / 4;
    pyr.castShadow = true;
    scene.add(pyr);
  } else {
    // flat roof lip
    const lip = new THREE.Mesh(new THREE.BoxGeometry(w + 0.5, 0.28, d + 0.5),
      new THREE.MeshStandardMaterial({ color: 0x3f342a, roughness: 1 }));
    lip.position.set(x, h + 0.1, z); lip.rotation.y = mesh.rotation.y;
    lip.castShadow = true;
    scene.add(lip);
  }
  buildings.push(new THREE.Box3().setFromObject(mesh));
}
for (let i = 0; i < 20; i++) {
  const a = (i / 20) * Math.PI * 2, r = 22 + (i % 5) * 6;
  const x = Math.cos(a) * r, z = Math.sin(a) * r - 15;
  if (Math.hypot(x, z - 8) < 11) continue;   // keep the player spawn area clear
  makeBuilding(x, z, 5 + (i % 3) * 2, 4.5 + (i % 5) * 2, 5 + (i % 4) * 2, i);
}
// crates
const crateMat = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.9 });
[[-4, -8, 1.1], [-3, -8.8, 0.9], [-3.5, -7.5, 0.8, 0.9], [6, -10, 1.2], [7.1, -10.3, 0.85],
 [2, -20, 1.0], [-8, -18, 1.1], [10, -22, 0.95]].forEach(([x, z, s, y]) => {
  const c = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), crateMat);
  c.position.set(x, (y || 0) + s / 2, z);
  c.rotation.y = rnd(0, 1.2);
  scene.add(c);
  buildings.push(new THREE.Box3().setFromObject(c));
});
// barrels
const barrelMat = new THREE.MeshStandardMaterial({ color: 0x39503a, map: metalTex, roughness: 0.7, metalness: 0.35 });
[[-6.5, -13], [5, -15.5], [5.7, -15.2], [-1, -27], [8.5, -25]].forEach(([x, z]) => {
  const b = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.1, 14), barrelMat);
  b.position.set(x, 0.55, z);
  scene.add(b);
  buildings.push(new THREE.Box3().setFromObject(b));
});
// sandbag lines
const bagMat = new THREE.MeshStandardMaterial({ color: 0x8a7c5c, roughness: 1 });
function sandbags(x, z, len, ry) {
  const g = new THREE.Group();
  for (let r = 0; r < 3; r++) for (let i = 0; i < len; i++) {
    const bag = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.34, 3, 6), bagMat);
    bag.rotation.z = Math.PI / 2;
    bag.position.set(i * 0.55 + (r % 2) * 0.24 - len * 0.27, 0.14 + r * 0.24, 0);
    g.add(bag);
  }
  g.position.set(x, 0, z); g.rotation.y = ry;
  scene.add(g);
  buildings.push(new THREE.Box3().setFromObject(g));
}
sandbags(0, -10.5, 7, 0);
sandbags(-9, -24, 6, 0.9);
sandbags(9, -18, 6, -0.7);

// ---------------------------------------------------------------- variety props (spheres, cones, reflections)
// jungle trees — cone canopies (triangles) on cylinder trunks; Colombia needs green
const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4228, roughness: 1 });
const leafMatA = new THREE.MeshStandardMaterial({ color: 0x2f6b33, roughness: 0.9 });
const leafMatB = new THREE.MeshStandardMaterial({ color: 0x3f7d2e, roughness: 0.9 });
function tree(x, z, s = 1) {
  const t = new THREE.Group();
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16 * s, 0.22 * s, 1.6 * s, 7), trunkMat);
  trunk.position.y = 0.8 * s; trunk.castShadow = true;
  const c1 = new THREE.Mesh(new THREE.ConeGeometry(1.15 * s, 1.9 * s, 8), leafMatA);
  c1.position.y = 2.2 * s; c1.castShadow = true;
  const c2 = new THREE.Mesh(new THREE.ConeGeometry(0.85 * s, 1.5 * s, 8), leafMatB);
  c2.position.y = 3.1 * s; c2.castShadow = true;
  t.add(trunk, c1, c2);
  t.position.set(x, 0, z);
  scene.add(t);
  buildings.push(new THREE.Box3().setFromObject(trunk).expandByScalar(0.1));
}
[[-12, 6, 1.1], [14, 4, 0.9], [-20, -12, 1.3], [18, -8, 1.0], [-6, -31, 0.9], [13, -33, 1.2],
 [24, -20, 1.0], [-24, -20, 1.1], [8, 8, 0.8], [-16, -36, 1.0], [20, 10, 1.2], [-26, 2, 0.9]]
  .forEach(([x, z, s]) => tree(x, z, s));

// water tower — reflective steel sphere on legs (spheres + reflections in one)
{
  const wt = new THREE.Group();
  const tankMat = new THREE.MeshStandardMaterial({ color: 0xb8c2c8, metalness: 1, roughness: 0.18 });
  const tank = new THREE.Mesh(new THREE.SphereGeometry(2.2, 20, 14), tankMat);
  tank.position.y = 9; tank.castShadow = true;
  const legMat = new THREE.MeshStandardMaterial({ color: 0x4a4f55, metalness: 0.8, roughness: 0.45 });
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 8.4, 8), legMat);
    leg.position.set(Math.cos(a) * 1.4, 4.2, Math.sin(a) * 1.4);
    leg.rotation.z = Math.cos(a) * 0.1; leg.rotation.x = -Math.sin(a) * 0.1;
    leg.castShadow = true;
    wt.add(leg);
  }
  wt.add(tank);
  wt.position.set(-22, 0, -28);
  scene.add(wt);
  buildings.push(new THREE.Box3().setFromObject(wt));
}

// puddles — mirror-flat reflective discs after the rain
const puddleMat = new THREE.MeshStandardMaterial({ color: 0x93aabb, metalness: 1, roughness: 0.06 });
[[3, -6, 1.4], [-7, -16, 1.9], [7.5, -20, 1.2], [-2, -28, 1.6], [11, -9, 1.0]].forEach(([x, z, r]) => {
  const p = new THREE.Mesh(new THREE.CircleGeometry(r, 20), puddleMat);
  p.rotation.x = -Math.PI / 2; p.position.set(x, 0.012, z);
  p.receiveShadow = true;
  scene.add(p);
});

// ---------------------------------------------------------------- character faces (painted per person)
const entities = [];
function faceTex(f = {}) {
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  const skin = f.skin || '#c9a184';
  if (f.mask === 'molotov') {
    // Molotov: BLACK KNIT SKI MASK with eye holes and the fire/bottle decal — a masked MAN, not a robot
    x.fillStyle = '#141414'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(255,255,255,${rnd(0.015, 0.05)})`; x.fillRect(rnd(0, 128), rnd(0, 128), 1.5, 1); } // knit weave
    // eye holes with real eyes inside
    [[40, 52], [88, 52]].forEach(([ex, ey]) => {
      x.fillStyle = skin; x.beginPath(); x.ellipse(ex, ey, 13, 9, 0, 0, 7); x.fill();
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey, 8, 5, 0, 0, 7); x.fill();
      x.fillStyle = '#5a3c22'; x.beginPath(); x.arc(ex, ey, 3.4, 0, 7); x.fill();
      x.fillStyle = '#000'; x.beginPath(); x.arc(ex, ey, 1.6, 0, 7); x.fill();
    });
    // painted flame decal rising from the chin + tiny molotov bottle on the forehead
    const fl = x.createLinearGradient(0, 128, 0, 78);
    fl.addColorStop(0, '#ff5522'); fl.addColorStop(0.6, '#ff9a2d'); fl.addColorStop(1, 'rgba(255,154,45,0)');
    x.fillStyle = fl;
    x.beginPath(); x.moveTo(8, 128);
    for (let i = 0; i <= 8; i++) x.lineTo(8 + i * 14, 128 - (i % 2 ? rnd(30, 44) : rnd(12, 20)));
    x.lineTo(120, 128); x.closePath(); x.fill();
    x.strokeStyle = '#ff7a2d'; x.lineWidth = 3;
    x.strokeRect(58, 14, 12, 18); x.fillStyle = '#ff7a2d'; x.fillRect(61, 8, 6, 6);   // the bottle
  } else if (f.mask === 'balaclava') {
    // HYDRA trooper: dark balaclava + goggles band
    x.fillStyle = '#1c1e22'; x.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 700; i++) { x.fillStyle = `rgba(255,255,255,${rnd(0.01, 0.04)})`; x.fillRect(rnd(0, 128), rnd(0, 128), 1.5, 1); }
    x.fillStyle = '#0c0d10'; x.fillRect(16, 38, 96, 26);                               // goggle band
    [[44, 51], [84, 51]].forEach(([ex, ey]) => {                                       // red lenses
      x.fillStyle = '#3b0f14'; x.beginPath(); x.ellipse(ex, ey, 13, 9, 0, 0, 7); x.fill();
      x.fillStyle = '#a33'; x.beginPath(); x.ellipse(ex - 3, ey - 2, 4, 2.5, 0, 0, 7); x.fill();
    });
  } else {
    // a human face: skin, eyes, brows, nose, mouth — per-character features
    x.fillStyle = skin; x.fillRect(0, 0, 128, 128);
    const shade = x.createLinearGradient(0, 0, 0, 128);
    shade.addColorStop(0, 'rgba(0,0,0,0.08)'); shade.addColorStop(0.5, 'rgba(0,0,0,0)'); shade.addColorStop(1, 'rgba(0,0,0,0.14)');
    x.fillStyle = shade; x.fillRect(0, 0, 128, 128);
    if (f.old) { x.strokeStyle = 'rgba(60,40,30,0.35)'; x.lineWidth = 1.5;             // age lines
      [[30, 80, 55, 84], [98, 80, 73, 84], [40, 100, 88, 100]].forEach(([a, b, cx2, d]) => { x.beginPath(); x.moveTo(a, b); x.quadraticCurveTo(64, b + 6, cx2, d); x.stroke(); }); }
    if (f.hair) { x.fillStyle = f.hair; x.fillRect(0, 0, 128, 22);                     // fringe
      x.fillRect(0, 0, 10, 60); x.fillRect(118, 0, 10, 60); }
    // eyes
    [[42, 54], [86, 54]].forEach(([ex, ey]) => {
      x.fillStyle = '#fff'; x.beginPath(); x.ellipse(ex, ey, 9.5, 6, 0, 0, 7); x.fill();
      x.fillStyle = f.eye || '#4a3c28'; x.beginPath(); x.arc(ex, ey, 3.6, 0, 7); x.fill();
      x.fillStyle = '#000'; x.beginPath(); x.arc(ex, ey, 1.8, 0, 7); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.beginPath(); x.arc(ex + 1.4, ey - 1.6, 1, 0, 7); x.fill();
    });
    // brows
    x.fillStyle = f.hair || '#2c2019';
    const tilt = f.worried ? -4 : f.stern ? 4 : 0;
    x.save(); x.translate(42, 43); x.rotate(tilt * 0.04); x.fillRect(-11, -2.5, 22, 5); x.restore();
    x.save(); x.translate(86, 43); x.rotate(-tilt * 0.04); x.fillRect(-11, -2.5, 22, 5); x.restore();
    // nose + mouth
    x.strokeStyle = 'rgba(60,40,30,0.5)'; x.lineWidth = 2.5;
    x.beginPath(); x.moveTo(64, 58); x.lineTo(61, 76); x.lineTo(67, 78); x.stroke();
    x.strokeStyle = '#6d4438'; x.lineWidth = 3.5;
    x.beginPath();
    if (f.worried) x.arc(64, 102, 12, Math.PI * 1.15, Math.PI * 1.85);
    else if (f.grim) { x.moveTo(50, 98); x.lineTo(78, 98); }
    else x.arc(64, 92, 12, Math.PI * 0.15, Math.PI * 0.85);
    x.stroke();
    if (f.mustache) { x.fillStyle = f.hair || '#3a2a1a';
      x.beginPath(); x.ellipse(64, 84, 20, 7, 0, 0, 7); x.fill(); }
    if (f.stubble) { for (let i = 0; i < 350; i++) { x.fillStyle = 'rgba(30,22,16,0.25)';
      x.fillRect(rnd(28, 100), rnd(86, 122), 1.2, 1.2); } }
    if (f.scar) { x.strokeStyle = 'rgba(140,60,50,0.8)'; x.lineWidth = 2.5;
      x.beginPath(); x.moveTo(96, 34); x.lineTo(88, 66); x.stroke(); }
    if (f.scarf) { x.fillStyle = '#7a6a4e'; x.fillRect(0, 68, 128, 60);                // shemagh over nose/mouth
      x.strokeStyle = 'rgba(0,0,0,0.2)'; for (let yy = 74; yy < 126; yy += 8) { x.beginPath(); x.moveTo(0, yy); x.lineTo(128, yy + 4); x.stroke(); } }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// distinctive face + headgear per named character
const PRESETS = {
  'Molotov':         { face: { mask: 'molotov' },                                              hat: null,      hairSide: '#141414' },
  'Fox':             { face: { skin: '#c98d63', hair: '#4a3320', mustache: true, stern: true }, hat: 'cap',     hairSide: '#4a3320' },
  'Striker':         { face: { skin: '#7a5236', hair: '#171412', stern: true, stubble: true },  hat: 'helmetG', hairSide: '#171412' },
  'Payback':         { face: { skin: '#d9ab88', scarf: true, eye: '#2e4a2e' },                  hat: 'hood',    hairSide: '#7a6a4e' },
  'Brian Wolford':   { face: { skin: '#dcb08e', hair: '#7a4a22', grim: true, scar: true },      hat: 'boonie',  hairSide: '#7a4a22' },
  'Jesse Wolford':   { face: { skin: '#dcb08e', hair: '#7a4a22', worried: true },               hat: 'boonie',  hairSide: '#7a4a22' },
  'Victor Prestige': { face: { skin: '#d8c2ad', hair: '#8e8e94', old: true, grim: true },       hat: null,      hairSide: '#8e8e94' },
  'Civilian':        { face: { skin: '#c9a184', hair: '#2e2a26' },                              hat: null,      hairSide: '#2e2a26' },
  'HYDRA Trooper':   { face: { mask: 'balaclava' },                                             hat: 'helmetB', hairSide: '#1c1e22' },
};

// ---------------------------------------------------------------- soldier models — JOINTED (shoulders/elbows/hips/knees)
function limbSeg(w, len, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, len, w), mat);
  m.position.y = -len / 2;
  m.castShadow = true;
  return m;
}
function soldierModel(kind, name) {
  const grp = new THREE.Group();
  const isEnemy = kind === 'enemy';
  const preset = PRESETS[name] || PRESETS['Civilian'];
  const suit = kind === 'protected'
    ? new THREE.MeshStandardMaterial({ color: 0x23262e, roughness: 0.55 })                     // Prestige: dark suit
    : new THREE.MeshStandardMaterial({ map: isEnemy ? camoBlack : camoGreen, roughness: 0.95 });
  const pants = new THREE.MeshStandardMaterial({ color: kind === 'neutral' ? 0x5a5347 : 0x2e3129, roughness: 1 });
  const skinM = new THREE.MeshStandardMaterial({ color: preset.face.skin || 0xc9a184, roughness: 0.8 });

  // torso + hips + chest rig
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, 0.26), suit); torso.position.y = 1.18; torso.castShadow = true;
  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.2, 0.24), pants); hips.position.y = 0.82; hips.castShadow = true;
  const rigM = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x15171a : 0x2c3526, roughness: 0.85 });
  for (let p = 0; p < 3; p++) {                              // ammo pouches on the chest
    const pouch = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.05), rigM);
    pouch.position.set(-0.15 + p * 0.15, 1.22, -0.155);
    grp.add(pouch);
  }
  // rounded shoulder pads (spheres!)
  const padM = new THREE.MeshStandardMaterial({ color: isEnemy ? 0x1a1c20 : 0x39452f, roughness: 0.9 });
  [-0.29, 0.29].forEach(px => {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), padM);
    pad.position.set(px, 1.44, 0); pad.castShadow = true;
    grp.add(pad);
  });
  // neck + head with the PAINTED FACE (front) and hair/mask color on the other sides
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.08, 8), skinM); neck.position.y = 1.51;
  const sideM = new THREE.MeshStandardMaterial({ color: preset.hairSide || '#2e2a26', roughness: 0.9 });
  const faceM = new THREE.MeshStandardMaterial({ map: faceTex(preset.face), roughness: 0.75 });
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.24), [sideM, sideM, sideM, skinM, sideM, faceM]);
  head.position.y = 1.68; head.castShadow = true;
  // headgear
  if (preset.hat === 'helmetB' || preset.hat === 'helmetG') {
    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 7, 0, Math.PI * 2, 0, 1.45),
      new THREE.MeshStandardMaterial({ color: preset.hat === 'helmetB' ? 0x1a1c20 : 0x3d4a33, roughness: 0.85 }));
    helmet.position.y = 1.8; helmet.castShadow = true; grp.add(helmet);
  } else if (preset.hat === 'boonie') {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.145, 10, 6, 0, Math.PI * 2, 0, 1.4),
      new THREE.MeshStandardMaterial({ color: 0x4c523a, roughness: 1 }));
    dome.position.y = 1.815;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.22, 0.025, 12),
      new THREE.MeshStandardMaterial({ color: 0x444a34, roughness: 1 }));
    brim.position.y = 1.79;
    grp.add(dome, brim);
  } else if (preset.hat === 'cap') {
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(0.135, 0.145, 0.09, 10),
      new THREE.MeshStandardMaterial({ color: 0x3a4530, roughness: 1 }));
    capTop.position.y = 1.83;
    const bill = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.02, 0.12),
      new THREE.MeshStandardMaterial({ color: 0x323b29, roughness: 1 }));
    bill.position.set(0, 1.8, -0.17);
    grp.add(capTop, bill);
  } else if (preset.hat === 'hood') {
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.165, 10, 7, 0, Math.PI * 2, 0, 1.7),
      new THREE.MeshStandardMaterial({ color: 0x7a6a4e, roughness: 1 }));
    hood.position.y = 1.74; grp.add(hood);
  }
  // ARMS — shoulder + elbow joints, posed holding the rifle
  function makeArm(side) {                                   // side: -1 left, +1 right
    const shoulder = new THREE.Group();
    shoulder.position.set(0.3 * side, 1.44, 0);
    shoulder.add(limbSeg(0.11, 0.26, suit));                 // upper arm
    const elbow = new THREE.Group();
    elbow.position.y = -0.26;
    elbow.add(limbSeg(0.09, 0.22, suit));                    // forearm
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.08), skinM);
    hand.position.y = -0.24; elbow.add(hand);
    shoulder.add(elbow);
    grp.add(shoulder);
    return { shoulder, elbow };
  }
  const armRJ = makeArm(1), armLJ = makeArm(-1);
  const combatant = isEnemy || kind === 'friendly';
  if (combatant) {                                           // firing pose: both hands to the weapon
    armRJ.shoulder.rotation.x = -1.15; armRJ.elbow.rotation.x = 0.55;
    armLJ.shoulder.rotation.x = -1.0;  armLJ.shoulder.rotation.z = -0.5; armLJ.elbow.rotation.x = 0.85;
  } else {                                                   // civilians: arms down, slight bend
    armRJ.shoulder.rotation.x = -0.1; armRJ.elbow.rotation.x = 0.2;
    armLJ.shoulder.rotation.x = -0.1; armLJ.elbow.rotation.x = 0.2;
  }
  armRJ.shoulder.userData.bx = armRJ.shoulder.rotation.x;
  armLJ.shoulder.userData.bx = armLJ.shoulder.rotation.x;
  // LEGS — hip + knee joints, natural stance
  function makeLeg(side) {
    const hip = new THREE.Group();
    hip.position.set(0.13 * side, 0.74, 0);
    hip.add(limbSeg(0.15, 0.36, pants));                     // thigh
    const knee = new THREE.Group();
    knee.position.y = -0.36;
    knee.add(limbSeg(0.13, 0.32, pants));                    // shin
    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.09, 0.24),
      new THREE.MeshStandardMaterial({ color: 0x1e1a14, roughness: 0.9 }));
    boot.position.set(0, -0.35, -0.04); boot.castShadow = true;
    knee.add(boot);
    hip.add(knee);
    grp.add(hip);
    return { hip, knee };
  }
  const legRJ = makeLeg(1), legLJ = makeLeg(-1);
  legRJ.hip.rotation.x = -0.06; legRJ.knee.rotation.x = 0.1;  // relaxed combat stance
  legLJ.hip.rotation.x = 0.08;  legLJ.knee.rotation.x = 0.06;
  grp.add(torso, hips, neck, head);
  const armL = armLJ.shoulder, armR = armRJ.shoulder;         // (kept names for the animator)
  const legL = legLJ.hip, legR = legRJ.hip;
  // rifle for combatants (with a real muzzle point — NPC shots come FROM the gun)
  let gun = null;
  if (isEnemy || kind === 'friendly') {
    gun = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.09, 0.5),
      new THREE.MeshStandardMaterial({ map: metalTex, roughness: 0.5, metalness: 0.5 }));
    const brl = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 0.24, 6),
      new THREE.MeshStandardMaterial({ color: 0x22252a, metalness: 0.6, roughness: 0.4 }));
    brl.rotation.x = Math.PI / 2; brl.position.z = -0.34;
    const gmag = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.15, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x2b2e33, roughness: 0.7 }));
    gmag.position.set(0, -0.1, -0.08); gmag.rotation.x = 0.25;
    body.castShadow = true;
    gun.add(body, brl, gmag);
    gun.position.set(0.12, 1.12, -0.3); gun.rotation.x = -0.08;
    grp.add(gun);
  }
  return { grp, torso, head, armL, armR, legL, legR, gun };
}
function makeEntity(name, kind, x, z, baseY = 0) {
  const colors = { enemy: 0xf38ba8, protected: 0xf38ba8, friendly: 0x89b4fa, neutral: 0xe6e6e6 };
  const m = soldierModel(kind, name);
  m.grp.position.set(x, baseY, z);
  scene.add(m.grp);
  const e = { name, kind, grp: m.grp, body: m.torso, head: m.head, model: m, color: colors[kind],
    hp: 100, alive: true, dying: 0, baseX: x, baseZ: z, baseY, phase: Math.random() * 9,
    shootTimer: 1 + Math.random() * 2.5, muzzleT: 0 };
  entities.push(e);
  return e;
}
// --- THE OPPOSITION ---
makeEntity('HYDRA Trooper', 'enemy', -6, -12);
makeEntity('HYDRA Trooper', 'enemy', 3, -16);
makeEntity('HYDRA Trooper', 'enemy', -2, -22);
makeEntity('HYDRA Trooper', 'enemy', 9, -14);
makeEntity('HYDRA Trooper', 'enemy', -10, -27);
makeEntity('HYDRA Trooper', 'enemy', 12, -29);
makeEntity('Victor Prestige', 'protected', 0, -34);
// --- TEAM APEX (Mission 1 deployment — your team fights WITH you) ---
makeEntity('Molotov', 'friendly', -4, 2);
makeEntity('Fox', 'friendly', -2, 4);
makeEntity('Striker', 'friendly', 2.5, 4);
makeEntity('Payback', 'friendly', 6, 2.5);
makeEntity('Civilian', 'neutral', 5, 1);
// The Wolford twins — on a rooftop, side by side, sniping below (their canonical M1 cameo)
makeBuilding(-15, -3, 6, 6, 6, 1);
makeEntity('Brian Wolford', 'friendly', -16, -3, 6);
makeEntity('Jesse Wolford', 'friendly', -14, -3, 6);

// ---------------------------------------------------------------- arsenal
const WEAPONS = [
  { name: 'M16',                 cls: 'Assault Rifle', att: 'Flame Charm',     dmg: 34, rpm: 700, mag: 30, reserve: 180, auto: true,  spread: 0.012 },
  { name: 'PP919',               cls: 'SMG',           att: '(compact, semi)', dmg: 22, rpm: 320, mag: 25, reserve: 200, auto: false, spread: 0.02 },
  { name: 'Benelli M3 Super 90', cls: 'Shotgun',       att: 'Pump/Semi',       dmg: 15, rpm: 90,  mag: 7,  reserve: 56,  auto: false, spread: 0.06, pellets: 8 },
  { name: 'The Statesman',       cls: 'Pistol',        att: 'Gilded Slide',    dmg: 40, rpm: 380, mag: 8,  reserve: 64,  auto: false, spread: 0.008 },
];
let wIndex = 0;
const wState = WEAPONS.map(w => ({ ammo: w.mag, reserve: w.reserve, reloading: false, reloadT: 0 }));
function curW() { return WEAPONS[wIndex]; }
function curS() { return wState[wIndex]; }

// ---------------------------------------------------------------- gun viewmodels (modeled, per-weapon)
const gunSteel = new THREE.MeshStandardMaterial({ map: metalTex, color: 0x9aa0a8, roughness: 0.45, metalness: 0.75 });
const gunBlack = new THREE.MeshStandardMaterial({ color: 0x1b1d21, roughness: 0.55, metalness: 0.4 });
const gunPoly  = new THREE.MeshStandardMaterial({ color: 0x2c2f35, roughness: 0.8, metalness: 0.1 });
const gunWood  = new THREE.MeshStandardMaterial({ map: woodTex, roughness: 0.8 });
const gunGold  = new THREE.MeshStandardMaterial({ color: 0xd9a92f, roughness: 0.25, metalness: 0.95 });

function buildM16() {
  const g = new THREE.Group();
  const upper = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.055, 0.52), gunBlack); upper.position.z = -0.28;
  const handguard = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.028, 0.3, 8), gunPoly);
  handguard.rotation.x = Math.PI / 2; handguard.position.z = -0.55;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.3, 8), gunSteel);
  barrel.rotation.x = Math.PI / 2; barrel.position.z = -0.82;
  const carry = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.038, 0.24), gunBlack); carry.position.set(0, 0.055, -0.22);
  const frontSight = new THREE.Mesh(new THREE.BoxGeometry(0.007, 0.055, 0.012), gunBlack); frontSight.position.set(0, 0.045, -0.68);
  const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.2, 0.09), gunSteel);
  mag.position.set(0, -0.12, -0.24); mag.rotation.x = 0.28;
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.14, 0.06), gunPoly);
  grip.position.set(0, -0.1, -0.06); grip.rotation.x = -0.35;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.08, 0.24), gunPoly); stock.position.set(0, -0.01, 0.09);
  // iron sights: THIN rear aperture ring on the carry handle, aligned with the front post
  const rearSight = new THREE.Mesh(new THREE.TorusGeometry(0.013, 0.002, 6, 14), gunBlack);
  rearSight.position.set(0, 0.065, -0.02);
  g.add(upper, handguard, barrel, carry, frontSight, mag, grip, stock, rearSight);
  return { g, mag, muzzle: new THREE.Vector3(0, 0, -0.97), pump: null, ads: new THREE.Vector3(0, -0.065, -0.36) };
}
function buildPP919() {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.085, 0.36), gunBlack); body.position.z = -0.18;
  const shroud = new THREE.Mesh(new THREE.CylinderGeometry(0.032, 0.032, 0.22, 10), gunSteel);
  shroud.rotation.x = Math.PI / 2; shroud.position.set(0, 0.01, -0.44);
  const helical = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.34, 10), gunPoly); // Bizon-style helical mag
  helical.rotation.x = Math.PI / 2; helical.position.set(0, -0.07, -0.26);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.055), gunPoly);
  grip.position.set(0, -0.1, -0.02); grip.rotation.x = -0.3;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.05, 0.2), gunSteel); stock.position.set(0, 0.005, 0.1);
  // iron sights: front post on the shroud + rear notch on the receiver
  const frontPost = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.03, 0.004), gunBlack);
  frontPost.position.set(0, 0.055, -0.5);
  const rearL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.022, 0.004), gunBlack); rearL.position.set(-0.012, 0.055, 0.0);
  const rearR = rearL.clone(); rearR.position.x = 0.014;
  g.add(body, shroud, helical, grip, stock, frontPost, rearL, rearR);
  return { g, mag: helical, muzzle: new THREE.Vector3(0, 0.01, -0.56), pump: null, ads: new THREE.Vector3(0, -0.058, -0.32) };
}
function buildBenelli() {
  const g = new THREE.Group();
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.08, 0.3), gunBlack); receiver.position.z = -0.12;
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.016, 0.55, 8), gunSteel);
  barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.02, -0.5);
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.45, 8), gunBlack);
  tube.rotation.x = Math.PI / 2; tube.position.set(0, -0.02, -0.45);
  const pump = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.16, 10), gunPoly);
  pump.rotation.x = Math.PI / 2; pump.position.set(0, -0.02, -0.42);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.06), gunPoly);
  grip.position.set(0, -0.1, 0.0); grip.rotation.x = -0.4;
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.1, 0.26), gunPoly); stock.position.set(0, -0.02, 0.16);
  // iron sights: brass bead at the muzzle + shallow rear posts on the receiver
  const bead = new THREE.Mesh(new THREE.SphereGeometry(0.007, 8, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9b25f, metalness: 0.9, roughness: 0.25 }));
  bead.position.set(0, 0.048, -0.76);
  const rearL = new THREE.Mesh(new THREE.BoxGeometry(0.004, 0.016, 0.006), gunBlack); rearL.position.set(-0.013, 0.048, 0.02);
  const rearR = rearL.clone(); rearR.position.x = 0.015;
  g.add(receiver, barrel, tube, pump, grip, stock, bead, rearL, rearR);
  return { g, mag: null, muzzle: new THREE.Vector3(0, 0.02, -0.78), pump, ads: new THREE.Vector3(0, -0.05, -0.3) };
}
function buildStatesman() {
  const g = new THREE.Group();
  const slide = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.05, 0.24), gunGold); slide.position.z = -0.1; // gilded slide (thin)
  const frame = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.038, 0.2), gunBlack); frame.position.set(0, -0.045, -0.08);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.13, 0.07), gunWood);
  grip.position.set(0, -0.11, -0.005); grip.rotation.x = -0.28;
  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.045, 0.05), gunBlack); trigger.position.set(0, -0.06, -0.1);
  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.02, 0.015), gunBlack); sight.position.set(0, 0.037, -0.2);
  // iron sights: rear notch posts on the gilded slide
  const rearL = new THREE.Mesh(new THREE.BoxGeometry(0.005, 0.016, 0.01), gunBlack); rearL.position.set(-0.011, 0.037, 0.0);
  const rearR = rearL.clone(); rearR.position.x = 0.013;
  g.add(slide, frame, grip, trigger, sight, rearL, rearR);
  return { g, mag: grip, muzzle: new THREE.Vector3(0, 0, -0.24), pump: slide, ads: new THREE.Vector3(0, -0.042, -0.3) };
}
const gunModels = [buildM16(), buildPP919(), buildBenelli(), buildStatesman()];

// weapon rig (holds the current gun; animated every frame)
const rig = new THREE.Group();
const HIP = new THREE.Vector3(0.26, -0.24, -0.55);
const ADS = new THREE.Vector3(0, -0.155, -0.42);
rig.position.copy(HIP);
gunModels.forEach((m, i) => { m.g.visible = i === 0; rig.add(m.g); });
camera.add(rig);
scene.add(camera);

// muzzle flash (textured plane + light)
const flashTex = canvasTex(128, (ctx, s) => {
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, 'rgba(255,240,190,1)');
  g.addColorStop(0.35, 'rgba(255,180,70,0.9)');
  g.addColorStop(1, 'rgba(255,120,20,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  ctx.strokeStyle = 'rgba(255,220,120,0.9)'; ctx.lineWidth = 6;
  for (let i = 0; i < 6; i++) {              // star spikes
    const a = i * 1.05;
    ctx.beginPath(); ctx.moveTo(s / 2, s / 2);
    ctx.lineTo(s / 2 + Math.cos(a) * s * 0.48, s / 2 + Math.sin(a) * s * 0.48); ctx.stroke();
  }
});
const flash = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.26),
  new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
flash.visible = false;
rig.add(flash);
const muzzleLight = new THREE.PointLight(0xffc36b, 0, 7);
rig.add(muzzleLight);

// shell casings
const shellGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.03, 6);
const shellMat = new THREE.MeshStandardMaterial({ color: 0xc8a13c, metalness: 0.9, roughness: 0.3 });
const shells = [];
function ejectShell() {
  const s = new THREE.Mesh(shellGeo, shellMat);
  const wp = new THREE.Vector3(0.06, -0.02, -0.15).applyMatrix4(rig.matrixWorld ? rig.matrixWorld : new THREE.Matrix4());
  rig.updateMatrixWorld();
  s.position.copy(new THREE.Vector3(0.06, -0.02, -0.15).applyMatrix4(rig.matrixWorld));
  const right = new THREE.Vector3(1, 0, 0).applyQuaternion(camera.quaternion);
  s.userData.v = right.multiplyScalar(rnd(1.2, 2)).add(new THREE.Vector3(0, rnd(1.6, 2.4), 0));
  s.userData.av = new THREE.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9));
  s.userData.t = 0;
  scene.add(s);
  shells.push(s);
  if (shells.length > 24) { const old = shells.shift(); scene.remove(old); }
}
function updateShells(dt) {
  for (let i = shells.length - 1; i >= 0; i--) {
    const s = shells[i];
    s.userData.t += dt;
    s.userData.v.y -= 9.8 * dt;
    s.position.addScaledVector(s.userData.v, dt);
    s.rotation.x += s.userData.av.x * dt; s.rotation.y += s.userData.av.y * dt; s.rotation.z += s.userData.av.z * dt;
    if (s.position.y < 0.02) { s.position.y = 0.02; s.userData.v.set(0, 0, 0); s.userData.av.set(0, 0, 0); }
    if (s.userData.t > 4) { scene.remove(s); shells.splice(i, 1); }
  }
}

// player bullet tracers
const tracerMatP = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.9 });
function playerTracer(to) {
  rig.updateMatrixWorld();
  const from = gunModels[wIndex].muzzle.clone().applyMatrix4(gunModels[wIndex].g.matrixWorld);
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, tracerMatP);
  scene.add(line);
  setTimeout(() => scene.remove(line), 40);
}

// ---------------------------------------------------------------- controls / input
const controls = new PointerLockControls(camera, renderer.domElement);
const keys = {};
let aiming = false;
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') reload();
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < WEAPONS.length) switchTo(n); }
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousedown', e => {
  if (e.button === 0) firing = true;
  if (e.button === 2) aiming = true;
});
addEventListener('mouseup', e => {
  if (e.button === 0) firing = false;
  if (e.button === 2) aiming = false;
});
addEventListener('contextmenu', e => e.preventDefault());

// ---------------------------------------------------------------- player state
const vel = new THREE.Vector3();
let vy = 0, onGround = true, crouching = false;
let firing = false, lastShot = 0;
let hp = 100, dead = false, killCount = 0, respawning = false;
let moveAmount = 0;   // 0..1 how much we're moving (drives bob)

// ---------------------------------------------------------------- gamepad
let padPrev = {};
function pollGamepad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [];
  const gp = [...pads].find(p => p);
  const padEl = document.getElementById('pad');
  if (!gp) { padEl.textContent = '🎮 controller: not detected'; padEl.classList.remove('on'); return null; }
  padEl.textContent = '🎮 controller: ' + (gp.id.slice(0, 22) || 'connected');
  padEl.classList.add('on');
  return gp;
}
function padBtn(gp, i) { return gp && gp.buttons[i] && gp.buttons[i].pressed; }
function padPressed(gp, i) { const now = padBtn(gp, i); const was = padPrev[i]; padPrev[i] = now; return now && !was; }
const DZ = 0.18;
function dz(v) { return Math.abs(v) < DZ ? 0 : v; }

// ---------------------------------------------------------------- shooting / reload
let recoil = 0;             // 0..1 spring
function reload() {
  const w = curW(), s = curS();
  if (s.reloading || s.ammo === w.mag || s.reserve <= 0) return;
  s.reloading = true; s.reloadT = 0;
  toast('RELOADING');
  setTimeout(() => {
    const need = w.mag - s.ammo, take = Math.min(need, s.reserve);
    s.ammo += take; s.reserve -= take; s.reloading = false;
  }, 900);
}
function switchTo(n) {
  if (n === wIndex) return;
  wIndex = n;
  gunModels.forEach((m, i) => m.g.visible = i === n);
  toast(curW().name);
}

const ray = new THREE.Raycaster();
function shoot() {
  const w = curW(), s = curS();
  if (s.reloading || dead) return;
  if (s.ammo <= 0) { reload(); return; }
  s.ammo--;
  recoil = 1;
  ejectShell();
  // muzzle flash
  const m = gunModels[wIndex];
  flash.position.copy(m.muzzle);
  flash.rotation.z = rnd(0, 6.28);
  flash.scale.setScalar(rnd(0.8, 1.3));
  flash.visible = true;
  muzzleLight.position.copy(m.muzzle);
  muzzleLight.intensity = 9;
  setTimeout(() => { flash.visible = false; muzzleLight.intensity = 0; }, 42);

  const pellets = w.pellets || 1;
  const sprMul = aiming ? 0.45 : 1;
  for (let p = 0; p < pellets; p++) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * w.spread * 2 * sprMul;
    dir.y += (Math.random() - 0.5) * w.spread * 2 * sprMul;
    dir.z += (Math.random() - 0.5) * w.spread * 2 * sprMul;
    dir.normalize();
    ray.set(camera.getWorldPosition(new THREE.Vector3()), dir);
    const meshes = [];
    entities.forEach(e => { if (e.alive) { e.body.userData.e = e; e.head.userData.e = e; meshes.push(e.body, e.head); } });
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length) {
      const e = hits[0].object.userData.e;
      if (e.kind === 'friendly' || e.kind === 'neutral') { failFriendlyFire(); return; }
      if (e.kind === 'protected') { toast('NICE TRY, BUT BE PATIENT'); playerTracer(hits[0].point); continue; }
      const head = hits[0].object === e.head;
      e.hp -= w.dmg * (head ? 2.2 : 1);
      hitSpark(hits[0].point);
      playerTracer(hits[0].point);
      if (e.hp <= 0) killEntity(e, head);
    } else {
      const far = camera.getWorldPosition(new THREE.Vector3()).addScaledVector(dir, 60);
      playerTracer(far);
    }
  }
}
function killEntity(e, head) {
  e.alive = false; e.dying = 1;     // death animation plays in loop
  killCount++;
  addKill(e.name + (head ? '  ✖ HEADSHOT' : '  ✖'));
  setTimeout(() => {
    e.hp = 100; e.alive = true; e.dying = 0;
    e.grp.visible = true;
    e.grp.rotation.set(0, 0, 0);
    e.grp.position.set(e.baseX, e.baseY, e.baseZ);
  }, 4500);
}
function hitSpark(pos) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffee88 }));
  s.position.copy(pos); scene.add(s);
  setTimeout(() => scene.remove(s), 90);
}

// ---------------------------------------------------------------- fail flash (friendly fire) + damage
const failEl = document.getElementById('fail');
function failFriendlyFire() {
  document.getElementById('failtext').textContent = 'FRIENDLY FIRE WILL NOT BE TOLERATED';
  failEl.classList.add('show'); dead = true;
  setTimeout(() => {
    hp = 100; camera.position.set(0, PLAYER_H, 8);
    camera.rotation.set(0, 0, 0);
    dead = false; failEl.classList.remove('show');
  }, 1400);
}
const dmgEl = document.getElementById('dmg');
let lastDamageAt = -Infinity;
function damagePlayer(amount) {
  if (dead || respawning) return;
  hp -= amount;
  lastDamageAt = performance.now();
  dmgEl.style.opacity = Math.min(0.9, 0.3 + amount / 20);
  setTimeout(() => dmgEl.style.opacity = 0, 130);
  if (hp <= 0) { hp = 0; playerDie(); }
}
function playerDie() {
  respawning = true; dead = true;
  document.getElementById('failtext').textContent = 'YOU ARE DOWN — RESPAWNING';
  failEl.classList.add('show');
  setTimeout(() => {
    hp = 100; camera.position.set(0, PLAYER_H, 8);
    failEl.classList.remove('show'); dead = false; respawning = false;
  }, 1500);
}
// ---------------------------------------------------------------- NPC gunfire (flashes, tracers, misses)
const tracerMatE = new THREE.LineBasicMaterial({ color: 0xff5566, transparent: true, opacity: 0.85 });
const tracerMatF = new THREE.LineBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0.8 });
function npcTracer(from, to, friendly) {
  const g = new THREE.BufferGeometry().setFromPoints([from, to]);
  const line = new THREE.Line(g, friendly ? tracerMatF : tracerMatE); scene.add(line);
  setTimeout(() => scene.remove(line), 55);
}
const flashSpriteMat = new THREE.SpriteMaterial({ map: flashTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
function npcFlash(pos) {
  const s = new THREE.Sprite(flashSpriteMat);
  s.position.copy(pos);
  s.scale.setScalar(rnd(0.28, 0.42));
  scene.add(s);
  setTimeout(() => scene.remove(s), 45);
}
function npcMuzzle(e) {
  // world position of this soldier's gun muzzle (falls back to chest height)
  if (e.model.gun) {
    e.model.gun.updateWorldMatrix(true, false);
    return new THREE.Vector3(0, 0, -0.46).applyMatrix4(e.model.gun.matrixWorld);
  }
  return e.grp.position.clone().add(new THREE.Vector3(0, 1.3, 0));
}
// One NPC shot with real aim error — can visibly MISS (tracer streaks past the target)
function npcFire(e, targetPos, opts = {}) {
  const from = npcMuzzle(e);
  npcFlash(from);
  const dir = targetPos.clone().sub(from).normalize();
  const err = opts.err ?? 0.06;
  dir.x += rnd(-err, err); dir.y += rnd(-err, err) * 0.6; dir.z += rnd(-err, err);
  dir.normalize();
  // closest approach of the shot line to the target — decides hit vs whiff
  const toT = targetPos.clone().sub(from);
  const along = toT.dot(dir);
  const closest = from.clone().addScaledVector(dir, Math.max(0, along));
  const missBy = closest.distanceTo(targetPos);
  const hit = missBy < (opts.hitRadius ?? 0.35);
  const end = hit ? targetPos.clone() : from.clone().addScaledVector(dir, Math.min(60, along + rnd(6, 18)));
  npcTracer(from, end, opts.friendly);
  return hit;
}

// ---------------------------------------------------------------- HUD
const hud = document.getElementById('hud');
const nameplateEl = document.getElementById('nameplate');
const toastEl = document.getElementById('toast');
const killfeedEl = document.getElementById('killfeed');
let toastT = 0;
function toast(t) { toastEl.textContent = t; toastEl.style.opacity = 1; toastT = 1.4; }
const kills = [];
function addKill(t) { kills.unshift(t); if (kills.length > 4) kills.pop(); killfeedEl.innerHTML = kills.join('<br>'); setTimeout(() => { kills.pop(); killfeedEl.innerHTML = kills.join('<br>'); }, 4000); }

function updateHUD() {
  const w = curW(), s = curS();
  document.getElementById('ammo').innerHTML = (s.reloading ? '⟳' : s.ammo) + '<small>/' + s.reserve + '</small>';
  document.getElementById('wname').textContent = w.name;
  document.getElementById('watt').textContent = w.cls + ' · ' + w.att + '  [1-4 swap · R reload · RMB aim]';
  document.getElementById('hpfill').style.width = Math.max(0, hp) + '%';
  document.getElementById('topright').innerHTML = isTouch
    ? '<b>CAMPAIGN</b> — Colombia, 1985<br>Left stick = move · drag right = look<br><b>FIRE</b> to shoot'
    : '<b>CAMPAIGN</b> — Colombia, 1985<br>Move <b>WASD</b> · Sprint <b>Shift</b> · Crouch <b>C</b> · Jump <b>Space</b><br>Shoot <b>LMB/RT</b> · Aim <b>RMB/LT</b> · Look <b>Mouse/R-Stick</b>';
}

const centerRay = new THREE.Raycaster();
function updateNameplate() {
  centerRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  const meshes = [];
  entities.forEach(e => { if (e.alive) { e.body.userData.e = e; e.head.userData.e = e; meshes.push(e.body, e.head); } });
  const hits = centerRay.intersectObjects(meshes, false);
  if (hits.length && hits[0].distance < 80) {
    const e = hits[0].object.userData.e;
    let col = e.kind === 'friendly' ? '#89b4fa' : (e.kind === 'neutral' ? '#e6e6e6' : '#f38ba8');
    nameplateEl.textContent = e.name;
    nameplateEl.style.color = col;
  } else nameplateEl.textContent = '';
}

// ---------------------------------------------------------------- game flow
let playing = false;
document.querySelectorAll('.mode').forEach(el => el.addEventListener('click', () => {
  const mode = el.dataset.mode;
  if (mode !== 'campaign') { toast('PROTOTYPE — not in this demo'); flashMenu(); return; }
  document.getElementById('menu').classList.add('hidden');
  document.getElementById('stamp').textContent = 'COLUMBIA, USA — 1985';
  document.getElementById('story').classList.remove('hidden');
}));
function flashMenu() { const m = document.getElementById('menu'); m.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(1.6)' }, { filter: 'brightness(1)' }], { duration: 300 }); }
document.getElementById('story').addEventListener('click', () => {
  document.getElementById('story').classList.add('hidden');
  hud.classList.remove('hidden');
  if (isTouch) { playing = true; document.getElementById('touch').classList.remove('hidden'); }
  else controls.lock();
});
controls.addEventListener('lock', () => { playing = true; });
controls.addEventListener('unlock', () => { playing = false; });

// ---------------------------------------------------------------- touch controls
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const touch = { moveX: 0, moveZ: 0, sprint: false, crouchToggle: false, firing: false,
  moveId: null, lookId: null, fireId: null, moveOrigin: null, lookLast: null };
const knobEl = document.getElementById('knob');
if (isTouch) document.body.classList.add('touchmode');

function zoneAt(x, y) {
  for (const id of ['btn-fire', 'btn-jump', 'btn-reload', 'btn-crouch', 'btn-swap', 'btn-aim', 'stick']) {
    const r = document.getElementById(id).getBoundingClientRect();
    if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return id;
  }
  return null;
}
function tStart(e) {
  if (!playing) return;
  for (const t of e.changedTouches) {
    const z = zoneAt(t.clientX, t.clientY);
    if (z === 'btn-fire') { touch.firing = true; touch.fireId = t.identifier; }
    else if (z === 'btn-jump') { if (onGround) { vy = 6; onGround = false; } }
    else if (z === 'btn-reload') { reload(); }
    else if (z === 'btn-crouch') { touch.crouchToggle = !touch.crouchToggle; }
    else if (z === 'btn-swap') { switchTo((wIndex + 1) % WEAPONS.length); }
    else if (z === 'btn-aim') { aiming = !aiming; document.getElementById('btn-aim').classList.toggle('on', aiming); }
    else if (z === 'stick' || t.clientX < innerWidth * 0.45) {
      touch.moveId = t.identifier;
      const r = document.getElementById('stick').getBoundingClientRect();
      touch.moveOrigin = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    } else { touch.lookId = t.identifier; touch.lookLast = { x: t.clientX, y: t.clientY }; }
  }
  e.preventDefault();
}
function tMove(e) {
  if (!playing) return;
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId && touch.moveOrigin) {
      const dx = t.clientX - touch.moveOrigin.x, dy = t.clientY - touch.moveOrigin.y;
      const max = 55, mag = Math.hypot(dx, dy), cl = Math.min(mag, max);
      const nx = mag ? dx / mag : 0, ny = mag ? dy / mag : 0;
      touch.moveX = nx * (cl / max); touch.moveZ = ny * (cl / max);
      touch.sprint = (cl / max) > 0.92;
      knobEl.style.left = (40 + nx * cl * 0.7) + 'px';
      knobEl.style.top = (40 + ny * cl * 0.7) + 'px';
    } else if (t.identifier === touch.lookId && touch.lookLast) {
      const dx = t.clientX - touch.lookLast.x, dy = t.clientY - touch.lookLast.y;
      const euler = new THREE.Euler(0, 0, 0, 'YXZ');
      euler.setFromQuaternion(camera.quaternion);
      euler.y -= dx * 0.004; euler.x -= dy * 0.004;
      euler.x = Math.max(-1.5, Math.min(1.5, euler.x));
      camera.quaternion.setFromEuler(euler);
      touch.lookLast = { x: t.clientX, y: t.clientY };
    }
  }
  e.preventDefault();
}
function tEnd(e) {
  for (const t of e.changedTouches) {
    if (t.identifier === touch.moveId) { touch.moveId = null; touch.moveX = 0; touch.moveZ = 0; touch.sprint = false; knobEl.style.left = '40px'; knobEl.style.top = '40px'; }
    if (t.identifier === touch.lookId) { touch.lookId = null; touch.lookLast = null; }
    if (t.identifier === touch.fireId) { touch.firing = false; touch.fireId = null; }
  }
}
if (isTouch) {
  addEventListener('touchstart', tStart, { passive: false });
  addEventListener('touchmove', tMove, { passive: false });
  addEventListener('touchend', tEnd);
  addEventListener('touchcancel', tEnd);
}

// ---------------------------------------------------------------- weapon animation (bob/sway/recoil/reload/ADS)
let bobPhase = 0;
const prevCamQ = new THREE.Quaternion();
function updateWeapon(dt) {
  const s = curS();
  // per-gun ADS: rig moves so THIS gun's iron sights sit on the eye line
  const onSights = aiming && !s.reloading;
  const target = onSights ? (gunModels[wIndex].ads || ADS) : HIP;
  document.getElementById('crosshair').style.opacity = onSights ? 0 : 1;

  // base approach (ADS <-> hip)
  rig.position.lerp(target, Math.min(1, dt * 14));

  // walk bob
  bobPhase += dt * (4 + moveAmount * 6.5);
  const bobAmt = moveAmount * (aiming ? 0.004 : 0.014);
  rig.position.y += Math.abs(Math.sin(bobPhase)) * -bobAmt + bobAmt * 0.5;
  rig.position.x += Math.cos(bobPhase * 0.5) * bobAmt * 0.6;

  // look sway (rig lags the camera slightly)
  const dq = prevCamQ.clone().invert().multiply(camera.quaternion);
  const e = new THREE.Euler().setFromQuaternion(dq, 'YXZ');
  rig.rotation.y = THREE.MathUtils.lerp(rig.rotation.y, THREE.MathUtils.clamp(e.y * 6, -0.06, 0.06), dt * 10);
  rig.rotation.x = THREE.MathUtils.lerp(rig.rotation.x, THREE.MathUtils.clamp(e.x * 6, -0.05, 0.05), dt * 10);
  prevCamQ.copy(camera.quaternion);

  // recoil spring
  if (recoil > 0) {
    recoil = Math.max(0, recoil - dt * 7);
    const k = recoil * recoil;
    rig.position.z += k * 0.055;
    rig.rotation.x += k * 0.06;
  }

  // reload animation (gun dips + rolls, mag drops and returns)
  if (s.reloading) {
    s.reloadT = Math.min(1, s.reloadT + dt / 0.9);
    const t = s.reloadT;
    const dip = Math.sin(t * Math.PI);        // 0->1->0
    rig.position.y += -dip * 0.13;
    rig.rotation.z = -dip * 0.5;
    rig.rotation.x += -dip * 0.25;
    const mag = gunModels[wIndex].mag;
    if (mag) {
      mag.userData.base = mag.userData.base || mag.position.clone();
      const mt = t < 0.45 ? t / 0.45 : t > 0.6 ? 1 - (t - 0.6) / 0.4 : 1;
      mag.position.y = mag.userData.base.y - mt * 0.16;
    }
  } else {
    rig.rotation.z = THREE.MathUtils.lerp(rig.rotation.z, 0, dt * 10);
    const mag = gunModels[wIndex].mag;
    if (mag && mag.userData.base) mag.position.copy(mag.userData.base);
  }

  // shotgun pump / pistol slide cycle on recoil
  const pump = gunModels[wIndex].pump;
  if (pump) {
    pump.userData.base = pump.userData.base || pump.position.clone();
    pump.position.z = pump.userData.base.z + recoil * (wIndex === 3 ? 0.05 : 0.09);
  }

  // FOV
  const targetFov = aiming && !s.reloading ? ADS_FOV : BASE_FOV;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov = THREE.MathUtils.lerp(camera.fov, targetFov, Math.min(1, dt * 12));
    camera.updateProjectionMatrix();
  }
}

// ---------------------------------------------------------------- entity animation (idle / aim / death)
function updateEntities(dt) {
  for (const e of entities) {
    if (e.dying > 0) {                        // death: fall back + settle
      e.dying = Math.max(0, e.dying - dt * 2.2);
      const t = 1 - e.dying;                  // 0->1
      e.grp.rotation.x = -t * Math.PI / 2;
      e.grp.position.y = e.baseY + t * 0.12;
      if (e.dying === 0) e.grp.visible = false;
      continue;
    }
    if (!e.alive) continue;
    e.phase += dt;
    // breathe + tiny idle shuffle
    e.grp.position.y = e.baseY + Math.sin(e.phase * 2) * 0.03;
    // breathe around the posed joints (not overwrite them)
    e.model.armL.rotation.x = (e.model.armL.userData.bx || 0) + Math.sin(e.phase * 1.7) * 0.035;
    e.model.armR.rotation.x = (e.model.armR.userData.bx || 0) - Math.sin(e.phase * 1.7) * 0.035;
    // friendlies face the nearest living enemy (they're IN the fight); everyone else faces you
    let face = camera.position;
    if (e.kind === 'friendly') {
      let bd = 70;
      for (const t of entities) {
        if (!t.alive || t.kind !== 'enemy') continue;
        const d = e.grp.position.distanceTo(t.grp.position);
        if (d < bd) { bd = d; face = t.grp.position; }
      }
    }
    e.grp.lookAt(face.x, e.grp.position.y, face.z);
  }
}

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, lastFps = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);

  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.4) { lastFps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
  document.getElementById('topleft').innerHTML =
    'FPS <span class="fps">' + lastFps + '</span>&nbsp;&nbsp;·&nbsp;&nbsp;KILLS <b style="color:#a6e3a1">' + killCount + '</b>';

  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.style.opacity = 0; }

  updateEntities(dt);
  updateShells(dt);
  skyDome.position.copy(camera.position);      // sky follows player

  const gp = pollGamepad();

  moveAmount = 0;
  if (playing && !dead) {
    if (gp) {
      const lookX = dz(gp.axes[2] || 0), lookY = dz(gp.axes[3] || 0);
      if (lookX || lookY) {
        camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -lookX * 2.4 * dt);
        camera.rotateX(-lookY * 2.0 * dt);
      }
      const ltHeld = !!(gp.buttons[6] && gp.buttons[6].value > 0.4);
      if (ltHeld !== !!padPrev.lt) { aiming = ltHeld; padPrev.lt = ltHeld; }
    }
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'] || (gp && padBtn(gp, 10)) || touch.sprint;
    crouching = keys['KeyC'] || (gp && padBtn(gp, 1)) || touch.crouchToggle;
    let speed = crouching ? 2.2 : sprint ? 8.5 : 5;
    if (aiming) speed *= 0.55;
    let ix = 0, iz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
    if (gp) { ix += dz(gp.axes[0] || 0); iz += dz(gp.axes[1] || 0); }
    if (isTouch) { ix += touch.moveX; iz += touch.moveZ; }
    const len = Math.hypot(ix, iz) || 1; ix /= len; iz /= len;
    moveAmount = Math.min(1, Math.hypot(ix, iz)) * (sprint ? 1 : 0.7);

    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3()
      .addScaledVector(fwd, -iz * speed)
      .addScaledVector(right, ix * speed);

    if ((keys['Space'] || (gp && padPressed(gp, 0))) && onGround) { vy = 6; onGround = false; }
    vy -= 18 * dt;

    const prev = camera.position.clone();
    camera.position.addScaledVector(move, dt);
    camera.position.y += vy * dt;

    const targetH = crouching ? CROUCH_H : PLAYER_H;
    if (camera.position.y <= targetH) { camera.position.y = targetH; vy = 0; onGround = true; }

    const pt = new THREE.Vector3(camera.position.x, 1, camera.position.z);
    for (const b of buildings) {
      if (b.containsPoint(pt)) { camera.position.x = prev.x; camera.position.z = prev.z; break; }
    }
    const R = 70;
    if (Math.hypot(camera.position.x, camera.position.z) > R) { camera.position.x = prev.x; camera.position.z = prev.z; }

    const rt = gp && (gp.buttons[7] && gp.buttons[7].value > 0.4);
    const wantFire = firing || rt || touch.firing;
    const w = curW();
    const now = performance.now();
    if (wantFire && now - lastShot > 60000 / w.rpm) { lastShot = now; shoot(); if (!w.auto) { firing = false; } }

    if (gp) {
      if (padPressed(gp, 2)) reload();
      if (padPressed(gp, 3)) switchTo((wIndex + 1) % WEAPONS.length);
      if (padPressed(gp, 5)) switchTo((wIndex + 1) % WEAPONS.length);
      if (padPressed(gp, 4)) switchTo((wIndex - 1 + WEAPONS.length) % WEAPONS.length);
    }

    // ---- ENEMY AI: pick a target (you or your team), fire with real aim error ----
    const friendlies = entities.filter(f => f.alive && f.kind === 'friendly');
    for (const e of entities) {
      if (!e.alive || e.kind !== 'enemy') continue;
      const d = e.grp.position.distanceTo(camera.position);
      if (d > 60) continue;
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 1.1 + Math.random() * 1.9;
        // 60% shoot at the player, 40% at a teammate (a real crossfire)
        if (friendlies.length && Math.random() < 0.4) {
          const f = friendlies[(Math.random() * friendlies.length) | 0];
          const aim = f.grp.position.clone().add(new THREE.Vector3(0, 1.2, 0));
          if (npcFire(e, aim, { err: 0.08, hitRadius: 0.3 })) {
            hitSpark(aim);                                    // teammates take the hit and stay up
            f.model.torso.rotation.z = 0.15;                  // flinch
            setTimeout(() => { if (f.model) f.model.torso.rotation.z = 0; }, 150);
          }
        } else {
          // aim error grows with distance and shrinks if you stand still & tall
          const err = 0.035 + d * 0.0011 + moveAmount * 0.03 + (crouching ? -0.008 : 0);
          if (npcFire(e, camera.position.clone(), { err, hitRadius: 0.4 })) {
            damagePlayer(6 + Math.random() * 9);
          }
          // whiff = you SEE the tracer streak past — that's the miss, no dice roll
        }
      }
    }

    // ---- TEAM APEX AI: your team fights with you ----
    for (const f of entities) {
      if (!f.alive || f.kind !== 'friendly') continue;
      f.shootTimer -= dt;
      if (f.shootTimer > 0) continue;
      f.shootTimer = 0.9 + Math.random() * 1.6;
      // nearest living enemy in range
      let best = null, bestD = 65;
      for (const e of entities) {
        if (!e.alive || e.kind !== 'enemy') continue;
        const d = f.grp.position.distanceTo(e.grp.position);
        if (d < bestD) { bestD = d; best = e; }
      }
      if (!best) continue;
      const isTwin = f.name.includes('Wolford');               // rooftop snipers shoot straighter
      const aim = best.grp.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      if (npcFire(f, aim, { err: isTwin ? 0.03 : 0.055, hitRadius: 0.32, friendly: true })) {
        best.hp -= isTwin ? 45 : 22;
        hitSpark(aim);
        if (best.hp <= 0 && best.alive) {
          best.alive = false; best.dying = 1;
          addKill(f.name + ' ✖ ' + best.name);
          setTimeout(() => {
            best.hp = 100; best.alive = true; best.dying = 0;
            best.grp.visible = true; best.grp.rotation.set(0, 0, 0);
            best.grp.position.set(best.baseX, best.baseY, best.baseZ);
          }, 4500);
        }
      }
    }

    // health regen: 3 seconds without taking damage -> regenerate to 100
    if (hp < 100 && performance.now() - lastDamageAt > 3000) {
      hp = Math.min(100, hp + 45 * dt);
    }

    updateNameplate();
  }

  updateWeapon(dt);
  updateHUD();
  renderer.render(scene, camera);
}
animate();

const BUILD = 4;   // bump with each demo update — shown on the badge so staleness is visible
window.__demo = { THREE, scene, camera, entities, WEAPONS, BUILD };
console.log('[demo] ready — Three r' + THREE.REVISION + ' · build ' + BUILD);
document.getElementById('jsok').textContent = 'js: ✓ running · build ' + BUILD;
