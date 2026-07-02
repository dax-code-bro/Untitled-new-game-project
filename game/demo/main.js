// UNTITLED — First Demo (vertical slice)
// Three.js FPS: KB+mouse AND full controller support, neon shader world built in code,
// the red/blue/white nameplate system, friendly-fire lockout, a small arsenal, story intro.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';

// ---------------------------------------------------------------- crash visibility (mobile debugging)
// Any JS error gets printed ON SCREEN so a phone user can see what broke.
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

// "script alive" badge — proves JS is running at all
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
app.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x05060a);
scene.fog = new THREE.FogExp2(0x05060a, 0.012);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.1, 500);
const PLAYER_H = 1.7, CROUCH_H = 1.0;
camera.position.set(0, PLAYER_H, 8);

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- lights
scene.add(new THREE.HemisphereLight(0x4466aa, 0x0a0810, 1.1));
scene.add(new THREE.AmbientLight(0x223355, 0.5));
const key = new THREE.DirectionalLight(0x88aaff, 0.7);
key.position.set(5, 12, 4);
scene.add(key);
// neon point lights for mood
[[0xff2d7a, -14, 3, -10], [0x00e5ff, 14, 3, -18], [0xf9e2af, 0, 4, -30]].forEach(([c, x, y, z]) => {
  const p = new THREE.PointLight(c, 40, 40); p.position.set(x, y, z); scene.add(p);
});

// ---------------------------------------------------------------- neon shader ground (procedural, no textures)
const groundMat = new THREE.ShaderMaterial({
  uniforms: { uTime: { value: 0 } },
  vertexShader: `
    varying vec3 vPos;
    void main(){ vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }
  `,
  fragmentShader: `
    varying vec3 vPos;
    uniform float uTime;
    // glowing neon grid built entirely in the shader
    float grid(vec2 p, float w){
      vec2 g = abs(fract(p) - 0.5);
      float line = min(g.x, g.y);
      return smoothstep(w, 0.0, line);
    }
    void main(){
      vec2 p = vPos.xz * 0.2;
      float g1 = grid(p, 0.04);
      float g2 = grid(p * 0.25, 0.03);
      float pulse = 0.6 + 0.4 * sin(uTime * 1.5 - length(vPos.xz) * 0.15);
      vec3 base = vec3(0.04,0.06,0.12);
      vec3 col = mix(base, vec3(0.15,1.1,1.3), g1 * (0.6 + 0.5*pulse));
      col += vec3(1.2,0.25,0.7) * g2 * 1.1;
      float fade = 1.0 - smoothstep(45.0, 140.0, length(vPos.xz));
      gl_FragColor = vec4(col * (0.35 + 0.65*fade), 1.0);
    }
  `,
});
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), groundMat);
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// ---------------------------------------------------------------- neon buildings (procedural geometry)
const buildings = [];
function makeBuilding(x, z, w, h, d, color) {
  const g = new THREE.BoxGeometry(w, h, d);
  const m = new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.5, metalness: 0.4, emissive: color, emissiveIntensity: 0.12 });
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, h / 2, z);
  scene.add(mesh);
  // neon edge glow
  const edges = new THREE.LineSegments(new THREE.EdgesGeometry(g),
    new THREE.LineBasicMaterial({ color }));
  edges.position.copy(mesh.position);
  scene.add(edges);
  buildings.push(new THREE.Box3().setFromObject(mesh));
}
const palette = [0x00e5ff, 0xff2d7a, 0xf9e2af, 0x89b4fa, 0xa6e3a1];
for (let i = 0; i < 22; i++) {
  const a = (i / 22) * Math.PI * 2, r = 20 + (i % 5) * 6;
  const x = Math.cos(a) * r, z = Math.sin(a) * r - 15;
  makeBuilding(x, z, 4 + (i % 3) * 2, 6 + (i % 6) * 3, 4 + (i % 4) * 2, palette[i % palette.length]);
}
// Bright neon landmark pillars (MeshBasicMaterial = always visible on any renderer)
function neonPillar(x, z, color, h = 14) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, h, 10),
    new THREE.MeshBasicMaterial({ color }));
  m.position.set(x, h / 2, z);
  scene.add(m);
  const light = new THREE.PointLight(color, 25, 30); light.position.set(x, h * 0.7, z); scene.add(light);
}
neonPillar(-8, -18, 0xff2d7a); neonPillar(8, -18, 0x00e5ff);
neonPillar(-14, -30, 0xf9e2af); neonPillar(14, -30, 0x89b4fa);
neonPillar(0, -46, 0xa6e3a1, 20);
// glowing "sun/moon" disc on the horizon for depth
const disc = new THREE.Mesh(new THREE.CircleGeometry(18, 40), new THREE.MeshBasicMaterial({ color: 0x2a1145 }));
disc.position.set(0, 12, -95); scene.add(disc);

// ---------------------------------------------------------------- entities (nameplate system)
// kind: 'enemy' (red, shootable), 'protected' (red, "nice try"), 'friendly' (blue), 'neutral' (white)
const entities = [];
function makeEntity(name, kind, x, z) {
  const colors = { enemy: 0xf38ba8, protected: 0xf38ba8, friendly: 0x89b4fa, neutral: 0xe6e6e6 };
  const grp = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color: kind === 'friendly' ? 0x1e3a8a : kind === 'neutral' ? 0x555 : 0x5a1020, emissive: colors[kind], emissiveIntensity: 0.85, roughness: 0.5 });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.4, 1.0, 4, 10), bodyMat);
  body.position.y = 1.0;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.28, 12, 12), bodyMat);
  head.position.y = 1.85;
  grp.add(body, head);
  grp.position.set(x, 0, z);
  scene.add(grp);
  const e = { name, kind, grp, body, head, color: colors[kind], hp: 100, alive: true,
    baseX: x, baseZ: z, phase: Math.random() * 9, shootTimer: 1 + Math.random() * 2.5 };
  entities.push(e);
  return e;
}
// A little cast pulled straight from the design
makeEntity('HYDRA Trooper', 'enemy', -6, -12);
makeEntity('HYDRA Trooper', 'enemy', 3, -16);
makeEntity('HYDRA Trooper', 'enemy', -2, -22);
makeEntity('HYDRA Trooper', 'enemy', 9, -14);
makeEntity('Victor Prestige', 'protected', 0, -34);      // named boss -> "Nice try, but be patient"
makeEntity('Molotov', 'friendly', -4, 2);                 // blue friendly
makeEntity('Civilian', 'neutral', 5, 1);                  // white neutral

// ---------------------------------------------------------------- arsenal (a real slice of the 200-gun system)
const WEAPONS = [
  { name: 'M16',                cls: 'Assault Rifle', att: 'Flame Charm',        dmg: 34, rpm: 700, mag: 30, reserve: 180, auto: true,  spread: 0.012 },
  { name: 'PP919',              cls: 'SMG',           att: '(compact, semi)',    dmg: 22, rpm: 320, mag: 25, reserve: 200, auto: false, spread: 0.02 },
  { name: 'Benelli M3 Super 90',cls: 'Shotgun',       att: 'Pump/Semi',          dmg: 15, rpm: 90,  mag: 7,  reserve: 56,  auto: false, spread: 0.06, pellets: 8 },
  { name: 'The Statesman',      cls: 'Pistol',        att: 'Gilded Slide',       dmg: 40, rpm: 380, mag: 8,  reserve: 64,  auto: false, spread: 0.008 },
];
let wIndex = 0;
const wState = WEAPONS.map(w => ({ ammo: w.mag, reserve: w.reserve, reloading: false }));
function curW() { return WEAPONS[wIndex]; }
function curS() { return wState[wIndex]; }

// viewmodel (a simple procedural "gun" in front of the camera)
const viewGun = new THREE.Group();
const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.16, 0.7),
  new THREE.MeshStandardMaterial({ color: 0x14161f, metalness: 0.7, roughness: 0.35, emissive: 0x111 }));
gunBody.position.set(0.28, -0.26, -0.6);
const muzzle = new THREE.PointLight(0xffcc66, 0, 6);
muzzle.position.set(0.28, -0.24, -1.0);
viewGun.add(gunBody, muzzle);
camera.add(viewGun);
scene.add(camera);

// ---------------------------------------------------------------- controls (mouse look)
const controls = new PointerLockControls(camera, renderer.domElement);

// ---------------------------------------------------------------- input state
const keys = {};
addEventListener('keydown', e => {
  keys[e.code] = true;
  if (e.code === 'KeyR') reload();
  if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < WEAPONS.length) switchTo(n); }
});
addEventListener('keyup', e => keys[e.code] = false);
addEventListener('mousedown', e => { if (e.button === 0) firing = true; });
addEventListener('mouseup', e => { if (e.button === 0) firing = false; });

// ---------------------------------------------------------------- player physics
const vel = new THREE.Vector3();
let vy = 0, onGround = true, crouching = false;
let firing = false, lastShot = 0;
let hp = 100, dead = false, killCount = 0, respawning = false;

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
function padPressed(gp, i) { // edge
  const now = padBtn(gp, i); const was = padPrev[i]; padPrev[i] = now; return now && !was;
}
const DZ = 0.18;
function dz(v) { return Math.abs(v) < DZ ? 0 : v; }

// ---------------------------------------------------------------- shooting
function reload() {
  const w = curW(), s = curS();
  if (s.reloading || s.ammo === w.mag || s.reserve <= 0) return;
  s.reloading = true;
  toast('RELOADING');
  setTimeout(() => {
    const need = w.mag - s.ammo, take = Math.min(need, s.reserve);
    s.ammo += take; s.reserve -= take; s.reloading = false;
  }, 900);
}
function switchTo(n) { if (n === wIndex) return; wIndex = n; toast(curW().name); }

const ray = new THREE.Raycaster();
function shoot() {
  const w = curW(), s = curS();
  if (s.reloading || dead) return;
  if (s.ammo <= 0) { reload(); return; }
  s.ammo--;
  muzzle.intensity = 5; setTimeout(() => muzzle.intensity = 0, 45);
  // recoil kick on viewmodel
  gunBody.position.z = -0.52; setTimeout(() => gunBody.position.z = -0.6, 50);

  const pellets = w.pellets || 1;
  for (let p = 0; p < pellets; p++) {
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.x += (Math.random() - 0.5) * w.spread * 2;
    dir.y += (Math.random() - 0.5) * w.spread * 2;
    dir.z += (Math.random() - 0.5) * w.spread * 2;
    dir.normalize();
    ray.set(camera.getWorldPosition(new THREE.Vector3()), dir);
    const meshes = [];
    entities.forEach(e => { if (e.alive) { e.body.userData.e = e; e.head.userData.e = e; meshes.push(e.body, e.head); } });
    const hits = ray.intersectObjects(meshes, false);
    if (hits.length) {
      const e = hits[0].object.userData.e;
      // STORY-PROTECTION RULES
      if (e.kind === 'friendly' || e.kind === 'neutral') { failFriendlyFire(); return; }
      if (e.kind === 'protected') { toast('NICE TRY, BUT BE PATIENT'); continue; }
      const head = hits[0].object === e.head;
      e.hp -= w.dmg * (head ? 2.2 : 1);
      hitSpark(hits[0].point);
      if (e.hp <= 0) killEntity(e, head);
    }
  }
}
function killEntity(e, head) {
  e.alive = false; e.grp.visible = false;
  killCount++;
  addKill(e.name + (head ? '  ✖ HEADSHOT' : '  ✖'));
  setTimeout(() => { // respawn so the demo stays lively
    e.hp = 100; e.alive = true; e.grp.visible = true;
    e.grp.position.set(e.baseX, 0, e.baseZ);
  }, 4000);
}
function hitSpark(pos) {
  const s = new THREE.Mesh(new THREE.SphereGeometry(0.08, 6, 6),
    new THREE.MeshBasicMaterial({ color: 0xffee88 }));
  s.position.copy(pos); scene.add(s);
  setTimeout(() => scene.remove(s), 90);
}

// ---------------------------------------------------------------- fail flash (friendly fire)
const failEl = document.getElementById('fail');
function failFriendlyFire() {
  document.getElementById('failtext').textContent = 'FRIENDLY FIRE WILL NOT BE TOLERATED';
  failEl.classList.add('show'); dead = true;
  setTimeout(() => { // "restart from last checkpoint"
    hp = 100; camera.position.set(0, PLAYER_H, 8);
    controls.getObject && (camera.rotation.set(0, 0, 0));
    dead = false; failEl.classList.remove('show');
  }, 1400);
}

// ---------------------------------------------------------------- enemy fire, player damage, death
const dmgEl = document.getElementById('dmg');
function damagePlayer(amount) {
  if (dead || respawning) return;
  hp -= amount;
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
const tracerMat = new THREE.LineBasicMaterial({ color: 0xff5566 });
function enemyTracer(from, to) {
  const g = new THREE.BufferGeometry().setFromPoints([from.clone().setY(1.4), to.clone()]);
  const line = new THREE.Line(g, tracerMat); scene.add(line);
  setTimeout(() => scene.remove(line), 60);
}

// ---------------------------------------------------------------- HUD
const hud = document.getElementById('hud');
const nameplateEl = document.getElementById('nameplate');
const fpsEl = document.getElementById('fps');
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
  document.getElementById('watt').textContent = w.cls + ' · ' + w.att + '  [1-4 swap · R reload]';
  document.getElementById('hpfill').style.width = Math.max(0, hp) + '%';
  document.getElementById('topright').innerHTML = isTouch
    ? '<b>CAMPAIGN</b> — Colombia, 1985<br>Left stick = move · drag right = look<br><b>FIRE</b> to shoot'
    : '<b>CAMPAIGN</b> — Colombia, 1985<br>Move <b>WASD</b> · Sprint <b>Shift</b> · Crouch <b>C</b> · Jump <b>Space</b><br>Shoot <b>LMB/RT</b> · Look <b>Mouse/R-Stick</b>';
}

// nameplate raycast from screen center
const centerRay = new THREE.Raycaster();
function updateNameplate() {
  centerRay.setFromCamera(new THREE.Vector2(0, 0), camera);
  const meshes = [];
  entities.forEach(e => { if (e.alive) { e.body.userData.e = e; e.head.userData.e = e; meshes.push(e.body, e.head); } });
  const hits = centerRay.intersectObjects(meshes, false);
  if (hits.length && hits[0].distance < 80) {
    const e = hits[0].object.userData.e;
    let label = e.name, col = '#e6e6e6';
    if (e.kind === 'enemy' || e.kind === 'protected') col = '#f38ba8';   // red full name
    else if (e.kind === 'friendly') col = '#89b4fa';                     // blue codename
    else col = '#e6e6e6';                                                // white neutral
    nameplateEl.textContent = label;
    nameplateEl.style.color = col;
  } else nameplateEl.textContent = '';
}

// ---------------------------------------------------------------- game flow (menu -> story -> play)
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
controls.addEventListener('unlock', () => { playing = false; if (!failEl.classList.contains('show')) { /* paused */ } });

// ---------------------------------------------------------------- touch controls (mobile)
const isTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0;
const touch = { moveX: 0, moveZ: 0, sprint: false, crouchToggle: false, firing: false,
  moveId: null, lookId: null, fireId: null, moveOrigin: null, lookLast: null };
const knobEl = document.getElementById('knob');
if (isTouch) document.body.classList.add('touchmode'); // touch buttons revealed at game start, not over the menu

function zoneAt(x, y) {
  for (const id of ['btn-fire', 'btn-jump', 'btn-reload', 'btn-crouch', 'btn-swap', 'stick']) {
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

// ---------------------------------------------------------------- main loop
const clock = new THREE.Clock();
let fpsAcc = 0, fpsFrames = 0, lastFps = 0;
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  groundMat.uniforms.uTime.value += dt;

  // fps
  fpsAcc += dt; fpsFrames++;
  if (fpsAcc >= 0.4) { lastFps = Math.round(fpsFrames / fpsAcc); fpsAcc = 0; fpsFrames = 0; }
  document.getElementById('topleft').innerHTML =
    'FPS <span class="fps">' + lastFps + '</span>&nbsp;&nbsp;·&nbsp;&nbsp;KILLS <b style="color:#a6e3a1">' + killCount + '</b>';

  // toast fade
  if (toastT > 0) { toastT -= dt; if (toastT <= 0) toastEl.style.opacity = 0; }

  // idle bob for entities
  entities.forEach(e => { if (e.alive) { e.phase += dt; e.grp.position.y = Math.sin(e.phase * 2) * 0.05; e.grp.lookAt(camera.position.x, e.grp.position.y + 1, camera.position.z); } });

  const gp = pollGamepad();

  if (playing && !dead) {
    // ---- look (gamepad right stick) ----
    if (gp) {
      const lookX = dz(gp.axes[2] || 0), lookY = dz(gp.axes[3] || 0);
      if (lookX || lookY) {
        camera.rotateOnWorldAxis(new THREE.Vector3(0, 1, 0), -lookX * 2.4 * dt);
        camera.rotateX(-lookY * 2.0 * dt);
      }
    }
    // ---- move ----
    const sprint = keys['ShiftLeft'] || keys['ShiftRight'] || (gp && padBtn(gp, 10)) || touch.sprint;
    crouching = keys['KeyC'] || (gp && padBtn(gp, 1)) || touch.crouchToggle;
    let speed = crouching ? 2.2 : sprint ? 8.5 : 5;
    let ix = 0, iz = 0;
    if (keys['KeyW'] || keys['ArrowUp']) iz -= 1;
    if (keys['KeyS'] || keys['ArrowDown']) iz += 1;
    if (keys['KeyA'] || keys['ArrowLeft']) ix -= 1;
    if (keys['KeyD'] || keys['ArrowRight']) ix += 1;
    if (gp) { ix += dz(gp.axes[0] || 0); iz += dz(gp.axes[1] || 0); }
    if (isTouch) { ix += touch.moveX; iz += touch.moveZ; }
    const len = Math.hypot(ix, iz) || 1; ix /= len; iz /= len;

    const fwd = new THREE.Vector3(); camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
    const right = new THREE.Vector3().crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const move = new THREE.Vector3()
      .addScaledVector(fwd, -iz * speed)
      .addScaledVector(right, ix * speed);

    // jump
    if ((keys['Space'] || (gp && padPressed(gp, 0))) && onGround) { vy = 6; onGround = false; }
    vy -= 18 * dt;

    const prev = camera.position.clone();
    camera.position.addScaledVector(move, dt);
    camera.position.y += vy * dt;

    // camera height for crouch
    const targetH = crouching ? CROUCH_H : PLAYER_H;
    // simple ground clamp
    if (camera.position.y <= targetH) { camera.position.y = targetH; vy = 0; onGround = true; }

    // building collision (push out on xz)
    const pt = new THREE.Vector3(camera.position.x, 1, camera.position.z);
    for (const b of buildings) {
      if (b.containsPoint(pt)) { camera.position.x = prev.x; camera.position.z = prev.z; break; }
    }
    // arena bounds
    const R = 70;
    if (Math.hypot(camera.position.x, camera.position.z) > R) { camera.position.x = prev.x; camera.position.z = prev.z; }

    // ---- fire ----
    const rt = gp && (gp.buttons[7] && gp.buttons[7].value > 0.4);
    const wantFire = firing || rt || touch.firing;
    const w = curW();
    const now = performance.now();
    if (wantFire && now - lastShot > 60000 / w.rpm) { lastShot = now; shoot(); if (!w.auto) { firing = false; } }

    // ---- gamepad buttons: reload (X=2), swap (Y=3 / bumpers) ----
    if (gp) {
      if (padPressed(gp, 2)) reload();
      if (padPressed(gp, 3)) switchTo((wIndex + 1) % WEAPONS.length);
      if (padPressed(gp, 5)) switchTo((wIndex + 1) % WEAPONS.length);
      if (padPressed(gp, 4)) switchTo((wIndex - 1 + WEAPONS.length) % WEAPONS.length);
    }

    // ---- enemy AI: shoot back ----
    for (const e of entities) {
      if (!e.alive || e.kind !== 'enemy') continue;
      const d = e.grp.position.distanceTo(camera.position);
      if (d > 55) continue;
      e.shootTimer -= dt;
      if (e.shootTimer <= 0) {
        e.shootTimer = 1.1 + Math.random() * 1.9;
        enemyTracer(e.grp.position, camera.position);
        const chance = THREE.MathUtils.clamp(1 - d / 75, 0.12, 0.6);
        if (Math.random() < chance) damagePlayer(6 + Math.random() * 9);
      }
    }

    updateNameplate();
  }

  updateHUD();
  renderer.render(scene, camera);
}
animate();

// expose a tiny hook for headless smoke-testing
window.__demo = { THREE, scene, camera, entities, WEAPONS };
console.log('[demo] ready — Three r' + THREE.REVISION);
document.getElementById('jsok').textContent = 'js: ✓ running (r' + THREE.REVISION + ')';
