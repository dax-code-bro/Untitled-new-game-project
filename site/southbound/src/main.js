// SOUTHBOUND — boot, world build, game loop.
import * as THREE from 'three';
import { loadSettings, saveSettings, resolveQuality, PRESETS } from './settings.js';
import { setupMenu, setupSettingsPanel } from './ui/menu.js';
import { buildRoadGraph, CITY, TOWN, regionAt } from './world/layout.js';
import { Heightmap } from './world/heightmap.js';
import { createTerrain, makeWorldTextures, worldUniforms } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createWeather } from './world/weather.js';
import { createWater } from './world/water.js';
import { createRoads } from './world/roads.js';
import { createBuildings } from './world/buildings.js';
import { createVegetation, grassUniforms } from './world/vegetation.js';
import { CollisionWorld } from './world/collision.js';
import { Player } from './entities/player.js';
import { Vehicle } from './entities/vehicle.js';
import { Traffic } from './entities/traffic.js';
import { Peds } from './entities/peds.js';
import { Combat, WEAPONS } from './entities/combat.js';
import { ArsenalUI } from './ui/arsenal-ui.js';
import { Career, loadProfile, newProfile } from './systems/career.js';
import { Interactions } from './systems/interact.js';
import { installSystems } from './systems/index.js';
import { Police } from './entities/police.js';
import { loadLibrary } from './assets/library.js';
import { loadSurfaces } from './assets/textures.js';
import { installAtmosphere } from './world/atmosphere.js';
import { Input } from './core/input.js';
import { CameraRig } from './core/camera.js';
import { createPost } from './core/post.js';
import { GameAudio } from './core/audio.js';
import { HUD } from './ui/hud.js';
import { nextFrame, clamp, wrapAngle } from './util.js';

const $ = (s) => document.querySelector(s);
const settings = loadSettings();
settings.isTouch = matchMedia('(pointer: coarse)').matches;
document.documentElement.style.setProperty('--hud', settings.hudScale);

const TIPS = [
  'Port Calvera never sleeps — the downtown towers light up after sunset.',
  'Redgrass Plains is open hunting land. Hunting arrives in a later update.',
  'Lake Arden\'s lake houses will be buyable properties.',
  'Hold Space while driving to pull the handbrake and drift.',
  'Press V to change the camera distance, M for the map.',
  'Settings → Content lets you turn blood and strong language off.',
];

let game = null;
const settingsPanel = setupSettingsPanel(settings, (key) => game?.applyLive(key));
$('#open-settings').onclick = () => settingsPanel.open();
$('#close-settings').onclick = () => settingsPanel.close();
setupMenu(settings, () => start());
window.__sbReady = true;

async function start() {
  $('#menu').classList.remove('show');
  $('#loading').classList.add('show');
  $('#tip').textContent = TIPS[(Math.random() * TIPS.length) | 0];
  const progress = (p, text) => { $('#loadbar').style.width = `${Math.round(p * 100)}%`; $('#loadtext').textContent = text; };
  try {
    game = await createGame(progress);
    window.__sbRunning = true;
  } catch (e) {
    console.error(e);
    progress(1, 'Something went wrong: ' + e.message);
  }
}

async function createGame(progress) {
  installAtmosphere();
  const q = resolveQuality(settings);
  const canvas = $('#game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa === 'msaa', powerPreference: 'high-performance', stencil: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.info.autoReset = false;
  renderer.shadowMap.enabled = q.shadows > 0;
  renderer.shadowMap.type = q.shadows >= 3 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.3, 12000);

  // ---- world
  progress(0.02, 'Surveying Calvera');
  await nextFrame();
  const hm = new Heightmap();
  const graph = buildRoadGraph();
  await hm.generate(progress, { erosionDrops: q.label === 'Phone' ? 80000 : q.label === 'Low' ? 140000 : 240000 });
  hm.shapeRoads(graph);
  progress(0.6, 'Paving roads and highways');
  await nextFrame();
  hm.buildSplat();
  const tex = makeWorldTextures(hm);
  worldUniforms.uHeightTex.value = tex.heightTex;
  worldUniforms.uSplatTex.value = tex.splatTex;
  const collision = new CollisionWorld(hm);
  progress(0.62, 'Loading photo-scanned surfaces');
  const surf = await loadSurfaces(renderer, q, (p) => progress(0.62 + p * 0.04, 'Loading photo-scanned surfaces'));
  progress(0.66, 'Shaping the terrain');
  await nextFrame();
  const terrain = createTerrain(hm, q, scene, surf);
  const water = createWater(scene, renderer, q);
  const roads = createRoads(graph, hm, q, scene, collision, surf);
  progress(0.74, 'Building Port Calvera and Mill Creek');
  await nextFrame();
  const city = createBuildings(hm, q, scene, collision, surf);
  progress(0.84, 'Growing Pinewood Hollow');
  await nextFrame();
  const veg = await createVegetation(hm, q, scene, collision, city.cityBlocks, (p) => progress(0.84 + p * 0.07, 'Growing forests'));
  addSidewalkColliders(collision);
  progress(0.92, 'Lighting the sky');
  await nextFrame();
  const sky = createSky(renderer, scene, q);
  const weather = createWeather(scene, q);
  sky.weather = weather;
  progress(0.93, 'Loading people and vehicles');
  const lib = await loadLibrary(q, (p, t) => progress(0.93 + p * 0.04, t));

  // ---- actors
  const player = new Player(scene, lib, 'hero');
  const spawn = { x: CITY.x0 - 26, z: CITY.z0 + 3 * CITY.pitch + 3 };
  player.pos.set(spawn.x, collision.surface(spawn.x, spawn.z, 50), spawn.z);
  player.heading = Math.PI / 2;
  const parked = [];
  const myCar = new Vehicle(lib, lib.cars.concept ? 'concept' : 'sedan-sports');
  myCar.pos.set(CITY.x0 - 14, CITY.height + 0.1, spawn.z - 6);
  myCar.heading = Math.PI / 2;
  myCar.sync(0);
  scene.add(myCar.group);
  parked.push(myCar);
  const traffic = new Traffic(graph, q, scene, lib);
  const basePreset = PRESETS[settings.preset] || PRESETS.high;

  const input = new Input(canvas, $('#touch'), settings);
  const rig = new CameraRig(camera, settings);
  rig.yaw = player.heading;
  const audio = new GameAudio(settings);
  audio.start();
  const peds = new Peds(lib, q, scene, collision, settings);
  const combat = new Combat(scene, hm, collision, settings, audio);
  const police = new Police(lib, scene, hm, collision, graph, peds, audio);
  const hud = new HUD($('#hud'), hm, graph, city.buildings, settings);

  // headlight for the player's car at night
  const headlight = new THREE.SpotLight(0xfff1d6, 0, 70, 0.55, 0.5, 1.2);
  scene.add(headlight, headlight.target);

  // ---- resolution / post
  let post = null;
  let dynScale = 1;
  const baseRatio = () => {
    const dpr = window.devicePixelRatio || 1;
    if (settings.resolution === 'native') return Math.min(dpr, q.maxPixelRatio);
    return clamp(+settings.resolution / innerHeight, 0.5, 4);
  };
  const applySize = () => {
    const pr = baseRatio() * dynScale;
    renderer.setPixelRatio(pr);
    renderer.setSize(innerWidth, innerHeight, false);
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    if (post) post.setSize(innerWidth, innerHeight);
  };
  applySize();
  post = createPost(renderer, scene, camera, q);
  if (post) renderer.toneMapping = THREE.NoToneMapping; // the post chain does filmic tone mapping
  applySize();
  addEventListener('resize', applySize);

  // warm up shaders so the first frames don't hitch
  progress(0.97, 'Compiling shaders');
  await nextFrame();
  sky.update(0, 0, player.pos);
  renderer.compile(scene, camera);

  $('#loading').classList.remove('show');
  $('#hud').classList.add('show');
  if (settings.isTouch || settings.platform === 'phone') { $('#touch').classList.add('show'); document.body.classList.add('touch'); }

  // ---- state
  let game_damageVehicle = null;
  const S = {
    mode: 'foot', vehicle: null, paused: false, override: null,
    money: 500, dead: 0, dmgFlash: 0, aimHold: 0, hitMarker: false,
    fps: 60, frameMs: 16, frames: 0, fpsTimer: 0, lowTimer: 0, highTimer: 0, resTimer: 0,
  };
  const stats = { drawCalls: 0, tris: 0 };
  S.lastVehicle = myCar; // your starter car shows on the minimap
  const arsenalUI = new ArsenalUI({
    combat, getMoney: () => S.money, pause: (b) => { S.frozen = b; },
    spend: (n) => { if (S.money < n) { hud.toast('Not enough money', 1.2); return false; } S.money -= n; return true; },
  });
  arsenalUI.enable();
  const toggleFreeCam = () => { rig.free = !rig.free; hud.toast(rig.free ? 'Free camera: look around freely (C to turn off)' : 'Camera follows the vehicle', 1.8); };
  addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat) toggleFreeCam(); });
  { const b = document.createElement('button'); b.textContent = '🎥'; b.className = 'sbPhoneBtn'; b.style.cssText = 'position:fixed;right:16px;top:222px;z-index:20;background:rgba(20,14,10,.7);color:#fff;border:1px solid #4a382b;border-radius:10px;padding:6px 10px;font:600 13px Inter,sans-serif'; b.onclick = toggleFreeCam; document.body.appendChild(b); }

  // ---- career (save game), interaction points and the gameplay systems ----
  const profile = loadProfile() || newProfile();
  S.money = profile.money;
  if (profile.weapons.owned) { for (const id of profile.weapons.owned) combat.give(id); Object.assign(combat.ammo, profile.weapons.ammo || {}); }
  const career = new Career(profile, {
    getMoney: () => S.money, setMoney: (n) => { S.money = Math.max(0, Math.round(n)); }, toast: (m, t) => hud.toast(m, t),
    snapshot: (p) => {
      p.money = S.money; p.hour = sky.hour; p.day = sky.day; p.weather = weather.kind;
      p.pos = [+player.pos.x.toFixed(1), +player.pos.z.toFixed(1)];
      p.weapons = { owned: combat.owned.slice(), ammo: combat.ammo };
    },
  });
  sky.hour = profile.hour; sky.day = profile.day;
  const interact = new Interactions(scene, hm);
  const game = {
    S, scene, hm, graph, city, player, combat, hud, sky, weather, career, interact, parked, lib, q, settings, camera, input, traffic, peds, police, collision, rig,
    pause: (b) => { S.frozen = b; },
    teleport: (x, z, heading = 0) => { api.teleport(x, z, heading); },
    enterVehicle: (v) => enterVehicle(v, null),
    exitVehicle: () => { if (S.mode === 'car') exitVehicle(); },
    vehicle: () => S.vehicle,
  };
  const systems = installSystems(game);

  const pauseEl = $('#pause');
  const setPaused = (p) => {
    S.paused = p;
    pauseEl.classList.toggle('show', p);
    if (p && document.pointerLockElement) document.exitPointerLock();
  };
  $('#resume').onclick = () => setPaused(false);
  $('#pause-settings').onclick = () => settingsPanel.open();
  $('#pause-map').onclick = () => { setPaused(false); hud.toggleMap(); };
  $('#quit').onclick = () => location.reload();

  hud.toast(settings.isTouch
    ? 'Welcome to Calvera. Tap 🚗 near a car to drive · 🔫 switch weapon · 🎯 aim · 💥 fire'
    : 'Welcome to Calvera. F: drive · Q: switch weapon · Right mouse: aim · Left mouse: fire', 7);

  // ---- combat, wanted level, death & arrest
  const HOSPITAL = { x: CITY.x0 + CITY.nx * CITY.pitch + 24, z: CITY.z0 + 2 * CITY.pitch, name: 'Port Calvera Medical Center' };
  const PRECINCT = { x: CITY.x0 - 24, z: CITY.z0 + 1 * CITY.pitch, name: 'Calvera PD · Central Precinct' };
  // damage a vehicle on the side facing (fx, fz); the HUD silhouette shows each side
  const damageVehicle = (v, amount, fx, fz) => {
    if (!v) return;
    v.health -= amount;
    const dx = fx - v.pos.x, dz = fz - v.pos.z, c = Math.cos(v.heading), s2 = Math.sin(v.heading);
    const lz = dx * s2 + dz * c, lx = dx * c - dz * s2; // local: +z forward, +x right
    const zone = Math.abs(lz) > Math.abs(lx) * 1.2 ? (lz > 0 ? 'front' : 'rear') : (lx > 0 ? 'right' : 'left');
    v.dmg = v.dmg || { front: 0, rear: 0, left: 0, right: 0 };
    v.dmg[zone] = Math.min(1, v.dmg[zone] + (amount / (v.maxHealth || 100)) * 2.2);
  };
  game_damageVehicle = damageVehicle;
  const hurtPlayer = (amount, from) => {
    if (S.dead) return;
    if (S.mode === 'car') { damageVehicle(S.vehicle, amount * 0.6, from ? from.x : S.vehicle.pos.x, from ? from.z : S.vehicle.pos.z + 1); player.damage(amount * 0.35); }
    else player.damage(amount);
    S.dmgFlash = Math.min(1, S.dmgFlash + 0.35);
  };
  police.onPlayerHit = (amount, from) => hurtPlayer(amount, from);
  const respawn = (at, title, sub, fee) => {
    S.dead = 4.5;
    hud.bigMessage(title, sub, 4);
    setTimeout(() => {
      if (S.mode === 'car') exitVehicle();
      police.clear();
      S.money = Math.max(0, S.money - fee);
      player.health = 100; player.armor = title === 'ARRESTED' ? player.armor : 0;
      player.pos.set(at.x, collision.surface(at.x, at.z, 200), at.z);
      player.vel.set(0, 0, 0);
      player.h.play('Idle_Loop', 0, 1, true);
      rig.yaw = player.heading;
      hud.toast(`${sub}. You paid $${fee}.`, 4);
    }, 3000);
  };
  police.onBusted = () => { if (!S.dead) { player.h.play('Idle_Loop', 0.2, 1, true); respawn(PRECINCT, 'ARRESTED', PRECINCT.name, Math.round(100 + S.money * 0.1)); } };
  const reportHit = (hit) => {
    if (!hit || hit.kind !== 'ped') return;
    const cop = hit.ped.role === 'cop';
    if (hit.killed) police.crime(cop ? 'copKill' : 'kill');
    else police.crime(cop ? 'copShot' : 'assault');
    S.hitMarker = true;
  };
  const witnesses = (pos, r) => peds.list.some((p) => p.mode !== 'dead' && p.pos.distanceTo(pos) < r);
  const aimDir = new THREE.Vector3(), muzzle = new THREE.Vector3();

  const tmpV = new THREE.Vector3();
  const focus = new THREE.Vector3();
  let last = performance.now();

  function enterVehicle(v, fromTraffic) {
    if (fromTraffic) {
      const sp = fromTraffic.speed;
      traffic.release(fromTraffic);
      v.vel.set(Math.sin(v.heading) * sp, Math.cos(v.heading) * sp);
      // carjacking: the driver is thrown out and runs
      const sx = Math.cos(v.heading), sz = -Math.sin(v.heading);
      peds.spawnAt(v.pos.x + sx * 2.2, v.pos.z + sz * 2.2, player.pos);
      if (witnesses(v.pos, 30) || police.nearPolice(60)) police.crime('carjack');
    } else parked.splice(parked.indexOf(v), 1);
    S.mode = 'car'; S.vehicle = v;
    if (combat.gun) combat.gun.visible = false;
    v.onHitPed = (p, killed) => { if (killed) police.crime(p.role === 'cop' ? 'copKill' : 'kill'); else police.crime('assault'); peds.panic(p.pos, 25); };
    player.char.root.visible = false;
    hud.toast(`${v.spec.name}`, 2.5);
  }
  function exitVehicle() {
    const v = S.vehicle;
    const sx = Math.cos(v.heading), sz = -Math.sin(v.heading);
    let x = v.pos.x + sx * (v.spec.width / 2 + 0.9), z = v.pos.z + sz * (v.spec.width / 2 + 0.9);
    const ep = v.exitPoint ? v.exitPoint(hm) : null;
    if (ep) { x = ep.x; z = ep.z; if (ep.bail) hud.toast('You bailed out', 2); }
    player.pos.set(x, ep ? hm.height(x, z) + 0.1 : collision.surface(x, z, v.pos.y + 1), z);
    player.vel.set(0, 0, 0);
    player.heading = v.heading;
    player.char.root.visible = true;
    v.vel.set(0, 0); v.speed = 0;
    parked.push(v);
    S.lastVehicle = v;
    S.mode = 'foot'; S.vehicle = null;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    if (S.frozen) { last = now; return; }
    let dt = (now - last) / 1000;
    last = now;
    if (dt <= 0) return;
    // fps tracking (real frame time, before clamping)
    S.frames++; S.fpsTimer += dt;
    if (S.fpsTimer >= 0.5) { S.fps = S.frames / S.fpsTimer; S.frames = 0; S.fpsTimer = 0; }
    tick(Math.min(dt, 0.05));
  }

  function tick(dt) {
    const a = input.poll();
    if (S.override) Object.assign(a, S.override);
    if (a.pause) setPaused(!S.paused);
    if (a.map) hud.toggleMap();
    if (S.paused) { render(); return; }
    audio.resume();
    worldUniforms.uTime.value += dt;

    let prompt = '';
    if (S.dead > 0) {
      // dead / arrested: freeze controls while the message shows
      S.dead -= dt;
      for (const k of ['moveX', 'moveY', 'throttle', 'brake', 'fire', 'firePressed', 'aim', 'jump', 'enter', 'weapon']) a[k] = 0;
      if (player.health <= 0 && player.h.current !== player.h.actions.Death01) player.h.play('Death01', 0.1, 1, true);
    } else if (player.health <= 0) {
      respawn(HOSPITAL, 'YOU DIED', HOSPITAL.name, Math.min(S.money, Math.round(100 + S.money * 0.1)));
      player.h.play('Death01', 0.1, 1, true);
    }
    if (a.weapon && S.mode === 'foot') combat.cycle();
    if (a.reload && combat.reload()) player.h.play('Pistol_Reload', 0.1, 1, true);
    const armed = !combat.def.melee;
    if (armed && (a.fire || a.firePressed)) S.aimHold = 0.7;
    S.aimHold = Math.max(0, S.aimHold - dt);
    if (S.aimHold > 0 && armed) a.aim = true;
    combat.update(dt);
    if (S.mode === 'foot') {
      player.update(dt, a, rig.yaw, hm, collision, armed);
      camera.getWorldDirection(aimDir);
      combat.holdGun(player.h, player.aiming ? aimDir : new THREE.Vector3(Math.sin(player.heading), -0.6, Math.cos(player.heading)), armed && S.dead <= 0);
      const targets = { peds, vehicles: [...traffic.cars.map((c) => c.v), ...police.cars.map((c) => c.v), ...parked], animals: game.hunting ? game.hunting.list : [] };
      if (armed && a.fire && player.aiming && combat.cooldown <= 0 && S.dead <= 0) {
        combat.muzzleWorld(muzzle);
        const hit = combat.attack(camera.position.clone(), aimDir.clone(), muzzle.clone(), targets, player.pos);
        if (hit) {
          player.h.play('Pistol_Shoot', 0.04, 1.6, true);
          reportHit(hit);
          if (witnesses(player.pos, 45)) police.crime('shots');
          peds.panic(player.pos, 45);
          if (hit.kind === 'vehicle' && hit.vehicle.type === 'police') police.crime('copShot');
        }
      } else if (!armed && a.firePressed && S.dead <= 0) {
        const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
        const hit = combat.attack(player.pos, fwd, null, targets, player.pos);
        if (hit) { player.h.play(Math.random() < 0.5 ? 'Punch_Jab' : 'Punch_Cross', 0.06, 1.3, true); reportHit(hit); if (hit.ped) peds.panic(hit.ped.pos, 15); }
      }
      // nearby car?
      let best = null, bd = 4.2, fromTraffic = null;
      for (const v of parked) { const d = v.pos.distanceTo(player.pos) - (v.isBoat || v.isAir ? v.radius * 0.8 : 0); if (d < bd) { bd = d; best = v; } }
      const tc = traffic.nearest(player.pos, bd);
      if (tc) { best = tc.v; fromTraffic = tc; }
      if (best) {
        prompt = settings.isTouch ? `Tap 🚗 to drive the ${best.spec.name}` : `Press F to drive the ${best.spec.name}`;
        if (a.enter) enterVehicle(best, fromTraffic);
      }
      focus.copy(player.pos);
    } else {
      const v = S.vehicle;
      const ctl = S.auto ? autopilot(v, dt) : { throttle: a.throttle, brake: a.brake, steer: -a.moveX, handbrake: a.handbrake, nitro: a.sprint };
      v.physics(dt, ctl, hm, collision);
      if (v.isAir) prompt = `ALT ${Math.round(v.alt)} m · ${v.heli ? 'Space/Shift up-down, W/S tilt, A/D turn' : `PWR ${Math.round(v.power * 100)}% · W/S power, Space/Shift pitch, A/D bank`}`;
      for (const p of v.isAir || v.isBoat ? [] : parked) {
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z, d = Math.hypot(dx, dz);
        if (d < 3.2 && d > 1e-3) { v.pos.x -= (dx / d) * (3.2 - d); v.pos.z -= (dz / d) * (3.2 - d); v.vel.multiplyScalar(0.7); v.impact = Math.max(v.impact, 3); }
      }
      v.night = sky.night;
      v.sync(dt);
      if (v.impact > 4) rig.shake = Math.min(1, v.impact / 15);
      if (v.impact > 4 && !v._hitLatch) { v._hitLatch = true; const f = v.forward ? v.forward() : { x: 0, z: 1 }, dir = (v.speed || 0) >= 0 ? 1 : -1; damageVehicle(v, (v.impact - 3) * 2.2, v.pos.x + f.x * 3 * dir, v.pos.z + f.z * 3 * dir); }
      if (v.impact < 1) v._hitLatch = false;
      if (a.enter && (Math.abs(v.speed) < 6 || v.isAir)) exitVehicle();
      else if (a.enter) prompt = 'Slow down to get out';
      if (v.drowned) prompt = 'The engine is flooded — press F to get out';
      focus.copy(v.pos);
    }
    for (const p of parked) { p.night = sky.night; p.sync(dt); }
    if (!S.dead) {
      const ip = interact.update(dt, focus, S.mode === 'car', S.mode === 'foot' && a.enter && !prompt, S.vehicle ? S.vehicle.speed : 0);
      if (!prompt) prompt = ip;
    }
    const sp = systems.update(dt, a, !prompt && !interact.consumed && S.mode === 'foot' && !S.dead);
    if (!prompt && sp) prompt = sp;
    career.update(dt);
    if (S.vehicle && S.vehicle.health <= 0 && !S.vehicle.wrecked) { S.vehicle.wrecked = true; hud.toast('The engine is wrecked — get out (F)', 4); }
    if (S.vehicle?.wrecked) { S.vehicle.vel.multiplyScalar(Math.exp(-3 * dt)); }

    const onFoot = S.mode === 'foot' ? player.pos : null;
    peds.update(dt, focus, onFoot, [S.vehicle, ...police.cars.map((c) => c.v), ...traffic.cars.map((c) => c.v)], (amt) => { S.money += amt; hud.toast(`+$${amt}`, 1.2); });
    police.update(dt, { pos: S.indoors ? new THREE.Vector3(S.indoors.d.x, focus.y, S.indoors.d.z) : focus, inCar: S.mode === 'car', speed: S.mode === 'car' ? S.vehicle.speed : player.speed, vehicle: S.vehicle });
    if (player.health > 0 && player.health < 100 && S.dead <= 0) player.health = Math.min(100, player.health + dt * (police.wanted ? 0 : 0.6));
    S.dmgFlash = Math.max(0, S.dmgFlash - dt * 0.8);
    if (post) post.grade.uniforms.uDamage.value = Math.max(S.dmgFlash, player.health < 25 ? 0.35 : 0);

    traffic.max = Math.round(basePreset.traffic * settings.trafficDensity);
    traffic.update(dt, focus, S.vehicle, S.mode === 'foot' ? player.pos : null, sky.night,
      [...peds.list.filter((p) => p.mode !== 'dead' && p.pos.distanceTo(focus) < 120), ...police.cars.map((c) => c.v)]);
    weather.update(dt, (dt * settings.timeScale) / 120, camera, !S.weatherLocked);
    sky.update(dt, settings.timeScale, focus);
    rig.update(dt, a, focus, { vehicle: S.vehicle, heading: S.vehicle?.heading, speed: S.vehicle?.speed || 0, lastLook: input.lastLookTime, aiming: S.mode === 'foot' && player.aiming && armed }, collision);

    const dd = basePreset.drawDistance * settings.drawDistance;
    terrain.update(camera.position, dd);
    veg.update(camera.position, dd);
    water.update(camera.position);
    roads.update(sky.night);
    scene.fog.density = 1.25 / Math.max(dd, 400) * (1 + sky.night * 0.5) * weather.fog;
    grassUniforms.uSunDir.value.copy(sky.sunDir);
    grassUniforms.uSunColor.value.copy(sky.sun.color).multiplyScalar(sky.sun.intensity * 0.35);
    grassUniforms.uAmbient.value.copy(sky.hemi.color).multiplyScalar(0.12 + sky.hemi.intensity * 0.9);
    grassUniforms.uFogColor.value.copy(scene.fog.color);
    grassUniforms.uFogDensity.value = scene.fog.density;

    // headlight
    if (S.vehicle && sky.night > 0.3) {
      const v = S.vehicle, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      headlight.intensity = 60 * sky.night;
      headlight.position.set(v.pos.x + fx * 2.4, v.pos.y + 0.9, v.pos.z + fz * 2.4);
      headlight.target.position.set(v.pos.x + fx * 25, v.pos.y - 1, v.pos.z + fz * 25);
    } else headlight.intensity = 0;

    // indoors: the map and region follow the building's front door, not the room
    const mapPos = S.indoors ? new THREE.Vector3(S.indoors.d.x, 0, S.indoors.d.z) : focus;
    const reg = regionAt(mapPos.x, mapPos.z);
    audio.update(dt, {
      driving: S.mode === 'car', speed: S.vehicle?.speed || 0, throttle: a.throttle, night: sky.night,
      horn: a.horn && S.mode === 'car', impact: S.vehicle?.impact || 0, nature: reg.name !== 'Port Calvera' && weather.rain < 0.2,
      rain: weather.rain, thunder: weather.thunder,
    });
    if (post) {
      post.grade.uniforms.uWarm.value = 0.012 + (sky.hour > 16 && sky.hour < 20 ? 0.018 : 0);
      post.grade.uniforms.uNight.value = sky.night;
      const aimingNow = S.mode === 'foot' && player.aiming && armed;
      post.update(sky.sunDir, sky.sunDir.y > 0.02 && weather.cover < 0.75, aimingNow ? 18 : camera.position.distanceTo(focus) + 1, aimingNow);
    }

    render();
    dynamicResolution(dt);
    hud.update(dt, {
      pos: mapPos, yaw: rig.yaw, heading: S.mode === 'car' ? S.vehicle.heading : player.heading,
      driving: S.mode === 'car', speed: S.vehicle?.speed || 0, hour: sky.hour, day: sky.day, prompt,
      police: [...police.cars.map((c) => c.v.pos), ...peds.list.filter((p) => p.role === 'cop' && p.mode !== 'dead').map((p) => p.pos)],
      hostiles: [...peds.list.filter((p) => p.role === 'foe' && p.mode !== 'dead').map((p) => p.pos), ...(game.hunting ? game.hunting.list.filter((x) => !x.dead && x.mode === 'charge').map((x) => x.pos) : [])],
      animals: game.hunting ? game.hunting.list.filter((x) => !x.dead && x.pos.distanceTo(focus) < 180).map((x) => ({ x: x.pos.x, z: x.pos.z, icon: { deer: '🦌', stag: '🦌', coyote: '🐺', fox: '🦊', horse: '🐎', cow: '🐄', bull: '🐂' }[x.sp] || '🐾' })) : [],
      myVehicles: S.mode === 'foot' ? parked.filter((v) => v === S.lastVehicle || v.uid).filter((v) => v.pos.distanceTo(focus) < 600).map((v) => ({ x: v.pos.x, z: v.pos.z, heading: v.heading })) : [],
      vehKind: S.vehicle ? (S.vehicle.isBoat ? 'boat' : S.vehicle.isAir ? (S.vehicle.heli ? 'heli' : 'plane') : 'car') : null, vehDmg: S.vehicle?.dmg,
      armed: !combat.def.melee,
      health: player.health, armor: player.armor, money: S.money, wanted: police.wanted, wantedLost: police.lost, blips: interact.blips(focus),
      weaponIcon: WEAPONS[combat.weapon].icon,
      ammo: !combat.def.melee ? (combat.reloading > 0 ? 'RELOADING' : `${combat.ammo[combat.weapon].clip} / ${combat.ammo[combat.weapon].reserve}`) : '',
      weaponName: combat.def.name,
      aiming: S.mode === 'foot' && player.aiming && armed, hitMarker: S.hitMarker,
      fpsText: `${Math.round(S.fps)} FPS · ${q.label} · ${renderer.domElement.width}×${renderer.domElement.height}\n${stats.drawCalls} draws · ${(stats.tris / 1e6).toFixed(2)}M tris`,
    });
    S.hitMarker = false;
  }

  // Road-following autopilot (demo camera / future cruise control)
  const _p = {};
  function edgePos(st, ahead) {
    const e = st.e, d = st.dir > 0 ? st.s + ahead : e.len - st.s - ahead;
    traffic.sampleEdge(e, d, _p);
    const tx = _p.tx * st.dir, tz = _p.tz * st.dir;
    return { x: _p.x - tz * 3, z: _p.z + tx * 3, tx, tz };
  }
  function autopilot(v, dt) {
    const st = S.auto;
    // advance s by projecting the car onto the edge
    let best = st.s, bd = Infinity;
    for (let k = -10; k <= 30; k += 1) {
      const q = edgePos(st, k);
      const d = Math.hypot(q.x - v.pos.x, q.z - v.pos.z);
      if (d < bd) { bd = d; best = st.s + k; }
    }
    st.s = Math.max(0, best);
    if (st.s > st.e.len - 4) {
      const nodeId = st.dir > 0 ? st.e.b : st.e.a;
      const node = graph.nodes.get(nodeId);
      const cur = edgePos(st, 0);
      let pick = null, score = -2;
      for (const id of node.edges) {
        if (id === st.e.id) continue;
        const e = graph.edges[id], dir = e.a === nodeId ? 1 : -1;
        const q = edgePos({ e, dir, s: 0 }, 10);
        const sc = (cur.tx * q.tx + cur.tz * q.tz) + (st.turn || 0) * (cur.tz * q.tx - cur.tx * q.tz);
        if (sc > score) { score = sc; pick = { e, dir }; }
      }
      if (pick) { st.e = pick.e; st.dir = pick.dir; st.s = 0; } else { st.dir *= -1; st.s = 0; }
    }
    const look = 10 + Math.abs(v.speed) * 0.6;
    const t = edgePos(st, look);
    const want = Math.atan2(t.x - v.pos.x, t.z - v.pos.z);
    const steer = clamp(wrapAngle(want - v.heading) * 2.4, -1, 1);
    const target = (st.speed || st.e.speed * 1.15) * (1 - Math.min(Math.abs(steer), 1) * 0.45);
    const err = target - v.speed;
    return { throttle: err > 0 ? clamp(err * 0.3, 0, 1) : 0, brake: err < -2 ? clamp(-err * 0.15, 0, 1) : 0, steer, handbrake: false };
  }
  function nearestRoad(x, z) {
    let best = null, bd = Infinity;
    for (const e of graph.edges) {
      for (let i = 0; i < e.pts.length; i++) {
        const d = Math.hypot(e.pts[i][0] - x, e.pts[i][1] - z);
        if (d < bd) { bd = d; best = { e, s: e.acc[i] }; }
      }
    }
    return best;
  }

  function render() {
    renderer.info.reset();
    water.renderReflection(scene, camera);
    if (post) post.render(1 / 60); else renderer.render(scene, camera);
    stats.drawCalls = renderer.info.render.calls;  // all passes this frame
    stats.tris = renderer.info.render.triangles;
  }

  // Lower resolution when the frame rate drops below target, raise it back when there is headroom.
  function dynamicResolution(dt) {
    if (!settings.dynamicRes) { if (dynScale !== 1) { dynScale = 1; applySize(); } return; }
    S.resTimer += dt;
    if (S.resTimer < 1.0) return;
    S.resTimer = 0;
    const target = settings.targetFps;
    if (S.fps < target * 0.9 && dynScale > q.minScale) { dynScale = Math.max(q.minScale, dynScale - 0.08); applySize(); S.highTimer = 0; }
    else if (S.fps >= target * 0.98) { if (++S.highTimer >= 3 && dynScale < 1) { dynScale = Math.min(1, dynScale + 0.05); applySize(); S.highTimer = 0; } }
    else S.highTimer = 0;
  }

  requestAnimationFrame(frame);

  // debug / automation hooks (used by the playtest script)
  const api = {
    get state() {
      return { mode: S.mode, pos: focus.toArray().map((v) => +v.toFixed(1)), fps: +S.fps.toFixed(1), hour: +sky.hour.toFixed(2), region: regionAt(focus.x, focus.z).name,
        speed: +(S.vehicle?.speed || 0).toFixed(1), traffic: traffic.cars.length, trees: veg.placed, buildings: city.count, draws: stats.drawCalls, tris: stats.tris, scale: dynScale, preset: q.label };
    },
    setHour(h) { sky.hour = h; },
    setWeather(kind) { weather.set(kind); weather.snap(); S.weatherLocked = true; },
    setOverride(o) { S.override = o; },
    teleport(x, z, heading = 0) {
      const y = collision.surface(x, z, 500);
      if (S.mode === 'car') { S.vehicle.pos.set(x, y, z); S.vehicle.heading = heading; S.vehicle.vel.set(0, 0); }
      else { player.pos.set(x, y, z); player.heading = heading; }
      rig.yaw = heading;
    },
    lookAt(yaw, pitch) { rig.yaw = yaw; rig.pitch = pitch; },
    setWanted(n) { police.wanted = n; police.cool = 0; },
    // aim the camera at the nearest pedestrian (for automated playtests)
    faceNearestPed(maxD = 40) {
      let best = null, bd = maxD;
      for (const p of peds.list) { if (p.mode === 'dead' || p.role === 'cop') continue; const d = p.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = p; } }
      if (!best) return false;
      rig.yaw = Math.atan2(best.pos.x - player.pos.x, best.pos.z - player.pos.z);
      rig.pitch = 0.05; player.heading = rig.yaw;
      return +bd.toFixed(1);
    },
    carjack() {
      const c = traffic.nearest(player.pos, 400);
      if (!c) return false;
      const sx = Math.cos(c.v.heading), sz = -Math.sin(c.v.heading);
      player.pos.set(c.v.pos.x - sx * 2.4, c.v.pos.y, c.v.pos.z - sz * 2.4);
      enterVehicle(c.v, c);
      return true;
    },
    get wanted() { return police.wanted; },
    get cops() { return { cars: police.cars.length, officers: peds.list.filter((p) => p.role === 'cop' && p.mode !== 'dead').length }; },
    giveMoney(n) { S.money += n; },
    openArsenal: (tab) => { if (tab) arsenalUI.tab = tab; arsenalUI.toggle(true); },
    weapon(w) { if (w !== 'fists') combat.give(w); combat.weapon = w; },
    arsenal: () => ({ owned: combat.owned.slice(), total: Object.keys(WEAPONS).length - 2 }),
    get peds() { return peds.list.length; },
    hurt(n) { hurtPlayer(n); },
    // Put the current vehicle on the nearest road, facing `heading`, and let the autopilot drive.
    autoDrive(x, z, heading, speed) {
      if (S.mode !== 'car') return false;
      const r = nearestRoad(x, z);
      const v = S.vehicle;
      const fx = Math.sin(heading), fz = Math.cos(heading);
      traffic.sampleEdge(r.e, r.s, _p);
      const dir = _p.tx * fx + _p.tz * fz >= 0 ? 1 : -1;
      S.auto = { e: r.e, dir, s: dir > 0 ? r.s : r.e.len - r.s, speed };
      const q = edgePos(S.auto, 0);
      v.pos.set(q.x, collision.surface(q.x, q.z, (_p.y || 0) + 3), q.z);
      v.heading = Math.atan2(q.tx, q.tz);
      v.vel.set(q.tx * (speed || 15), q.tz * (speed || 15));
      v.airborne = false; v.vy = 0;
      rig.yaw = v.heading;
      return true;
    },
    stopAuto() { S.auto = null; },
    exitCar() { if (S.mode === 'car') { S.auto = null; S.vehicle.vel.set(0, 0); exitVehicle(); } },
    enterNearest() {
      let best = null, bd = 30;
      for (const v of parked) { const d = v.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = v; } }
      if (best) enterVehicle(best, null);
    },
    spawnCar(type = 'sedan-sports') {
      const v = new Vehicle(lib, type);
      v.pos.copy(player.pos); v.heading = player.heading; scene.add(v.group); parked.push(v); return true;
    },
    pause: setPaused,
    freeze(f) { S.frozen = f; },
    // Advance the game by exactly n fixed steps (used to capture smooth video on slow machines)
    step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) tick(dt); S.fps = 1 / dt; },
    toggleMap: () => hud.toggleMap(),
    showRegion: () => { hud.lastRegion = ''; hud.toastTimer = 0.001; },
    renderer, scene, camera, debug: { hm, graph, collision },
  };
  api.game = game;
  window.SB = api;

  return {
    applyLive(key) {
      if (key === 'fov') camera.fov = settings.fov;
      if (['resolution', 'dynamicRes'].includes(key)) { dynScale = 1; applySize(); }
      if (key.endsWith('Volume')) audio.applyVolumes();
      if (key === 'hudScale') document.documentElement.style.setProperty('--hud', settings.hudScale);
      saveSettings(settings);
    },
  };
}

function addSidewalkColliders(collision) {
  // Sidewalk slabs: walkable boxes you step up onto
  for (const G of [CITY, TOWN]) {
    for (let i = 0; i < G.nx; i++) for (let j = 0; j < G.nz; j++) {
      const x = G.x0 + i * G.pitch + G.street / 2, z = G.z0 + j * G.pitch + G.street / 2, w = G.pitch - G.street;
      collision.addBox(x, z, x + w, z + w, G.height - 1, G.height + 0.22, { walkable: true });
    }
  }
}
