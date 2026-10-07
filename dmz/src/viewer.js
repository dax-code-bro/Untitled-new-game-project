// Scan viewer: inspect processed scans before they go into the game.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const $ = (id) => document.getElementById(id);
const renderer = new THREE.WebGLRenderer({ canvas: $('c'), antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x1a1b1e);
const camera = new THREE.PerspectiveCamera(50, 1, 0.01, 2000);
camera.position.set(4, 2.5, 5);
const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.8, 0);
controls.enableDamping = true;

scene.add(new THREE.HemisphereLight(0xfff2dd, 0x4a4036, 1.3));
const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
sun.position.set(6, 10, 4);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -10, right: 10, top: 10, bottom: -10 });
scene.add(sun);

const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshLambertMaterial({ color: 0x2a2b2e }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);
const grid = new THREE.GridHelper(40, 40, 0x555555, 0x333333);
grid.position.y = 0.002;
scene.add(grid);

// 1.8 m reference figure for checking scan scale
const human = new THREE.Group();
const hm = new THREE.MeshLambertMaterial({ color: 0x4aa3ff, transparent: true, opacity: 0.55 });
const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 1.1, 4, 12), hm);
body.position.y = 0.77;
const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), hm);
head.position.y = 1.68;
human.add(body, head);
scene.add(human);

let current = null; // { root, levels, lod }
let lodMode = 'auto';
let wire = false;

function countTris(obj) {
  let n = 0;
  obj.traverse((o) => {
    if (!o.isMesh) return;
    const g = o.geometry;
    n += (g.index ? g.index.count : g.attributes.position.count) / 3;
  });
  return Math.round(n);
}

function textures(obj) {
  const set = new Map();
  obj.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of [].concat(o.material)) {
      for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap']) {
        const t = m[k];
        if (t && t.image) set.set(t.uuid, `${k.replace('Map', '') || 'color'} ${t.image.width}×${t.image.height}`);
      }
    }
  });
  return [...set.values()];
}

function show(root, def = null) {
  if (current) scene.remove(current.lod);
  // levels: nodes named *_LOD0, *_LOD1 ... or the whole scene
  const named = [];
  root.traverse((o) => { const m = /_LOD(\d+)$/.exec(o.name); if (m) named[+m[1]] = o; });
  const nodes = named.filter(Boolean);
  const levels = nodes.length ? nodes : [root];
  const lod = new THREE.LOD();
  levels.forEach((n, i) => {
    n.position.set(0, 0, 0);
    n.traverse((o) => { if (o.isMesh) { o.castShadow = o.receiveShadow = true; } });
    const dist = def && def.lods && def.lods[i] ? def.lods[i].distance : [0, 25, 70, 140][i] ?? i * 50;
    lod.addLevel(n, dist);
  });
  scene.add(lod);
  current = { root, levels, lod, def };
  const box = new THREE.Box3().setFromObject(levels[0]);
  const size = box.getSize(new THREE.Vector3());
  human.position.set(box.max.x + 0.6, 0, 0);
  controls.target.set(0, size.y / 2, 0);
  const r = Math.max(size.x, size.y, size.z, 1.8);
  camera.position.set(r * 1.4, r * 0.8, r * 1.8);
  // LOD buttons
  const btns = ['auto', ...levels.map((_, i) => i)].map((k) =>
    `<button data-lod="${k}" class="${String(lodMode) === String(k) ? 'on' : ''}">${k === 'auto' ? 'Auto' : 'LOD' + k}</button>`).join('');
  $('lods').innerHTML = btns;
  applyWire();
  stats();
}

function stats() {
  if (!current) return;
  const { levels, def } = current;
  const box = new THREE.Box3().setFromObject(levels[0]);
  const s = box.getSize(new THREE.Vector3());
  const d = camera.position.distanceTo(controls.target);
  let rows = `<tr><td>Size (w×h×d)</td><td>${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)} m</td></tr>`;
  const shown = lodMode === 'auto' ? current.lod.getCurrentLevel() : lodMode;
  levels.forEach((l, i) => { rows += `<tr><td>LOD${i}${shown === i ? ' ◂' : ''}</td><td>${countTris(l).toLocaleString()} tris</td></tr>`; });
  for (const t of textures(levels[0])) rows += `<tr><td class="dim">texture</td><td>${t}</td></tr>`;
  if (def) rows += `<tr><td>Slot</td><td>${def.slot}</td></tr><tr><td>License</td><td>${def.license || '?'}</td></tr>${def.author ? `<tr><td>Author</td><td>${def.author}</td></tr>` : ''}`;
  rows += `<tr><td class="dim">Camera distance</td><td>${d.toFixed(1)} m</td></tr>`;
  $('stats').innerHTML = rows;
}

function applyWire() {
  if (!current) return;
  for (const l of current.levels) l.traverse((o) => { if (o.isMesh) for (const m of [].concat(o.material)) m.wireframe = wire; });
}

const loader = new GLTFLoader();
async function loadUrl(url, def) {
  const g = await loader.loadAsync(url);
  show(g.scene, def);
}

// manifest
let manifest = { assets: [] };
fetch('assets/assets.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : { assets: [] })).then((m) => {
  manifest = m;
  for (const a of m.assets) $('pick').insertAdjacentHTML('beforeend', `<option value="${a.id}">${a.id} (${a.slot})</option>`);
  if (m.assets.length) { $('pick').value = m.assets[0].id; loadUrl('assets/' + m.assets[0].file, m.assets[0]); }
}).catch(() => {});
$('pick').addEventListener('change', (e) => {
  const a = manifest.assets.find((x) => x.id === e.target.value);
  if (a) loadUrl('assets/' + a.file, a);
});

// UI
$('lods').addEventListener('click', (e) => {
  const b = e.target.closest('[data-lod]');
  if (!b) return;
  lodMode = b.dataset.lod === 'auto' ? 'auto' : +b.dataset.lod;
  for (const x of $('lods').children) x.classList.toggle('on', x === b);
});
$('wire').addEventListener('click', (e) => { wire = !wire; e.target.classList.toggle('on', wire); applyWire(); });
$('human').addEventListener('click', (e) => { human.visible = !human.visible; e.target.classList.toggle('on', human.visible); });
$('grid').addEventListener('click', (e) => { grid.visible = !grid.visible; e.target.classList.toggle('on', grid.visible); });
let sunSpin = false;
$('sun').addEventListener('click', (e) => { sunSpin = !sunSpin; e.target.classList.toggle('on', sunSpin); });

// drag & drop
addEventListener('dragover', (e) => { e.preventDefault(); $('drop').style.display = 'flex'; });
addEventListener('dragleave', () => { $('drop').style.display = 'none'; });
addEventListener('drop', async (e) => {
  e.preventDefault();
  $('drop').style.display = 'none';
  const f = [...e.dataTransfer.files].find((x) => /\.(glb|gltf)$/i.test(x.name));
  if (!f) return;
  const url = URL.createObjectURL(f);
  try { await loadUrl(url, null); } finally { URL.revokeObjectURL(url); }
});

function resize() {
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

let t = 0, statT = 0;
renderer.setAnimationLoop((now) => {
  const dt = Math.min(0.05, (now - t) / 1000 || 0);
  t = now;
  controls.update();
  if (sunSpin) { const a = now / 2500; sun.position.set(Math.cos(a) * 10, 8, Math.sin(a) * 10); }
  if (current) {
    current.lod.autoUpdate = lodMode === 'auto';
    if (lodMode !== 'auto') current.lod.levels.forEach((l, i) => { l.object.visible = i === lodMode; });
  }
  statT -= dt;
  if (statT <= 0) { statT = 0.25; stats(); }
  renderer.render(scene, camera);
});
