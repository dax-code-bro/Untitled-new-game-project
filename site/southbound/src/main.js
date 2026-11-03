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
import { locomotion } from './entities/human.js';
import { Traffic } from './entities/traffic.js';
import { Peds } from './entities/peds.js';
import { Combat, WEAPONS } from './entities/combat.js';
import { GunPose } from './entities/gunpose.js';
import { WeaponWheel } from './ui/wheel.js';
import { makeSilhouetter } from './ui/silhouette.js';
import { installLaw } from './systems/law.js';
import { installRoadside } from './systems/roadside.js';
import { installGang } from './systems/gang.js';
import { installGunStores } from './systems/gunstores.js';
import { installShops } from './systems/shops.js';
import { createBillboards } from './world/billboards.js';
import { installProps } from './systems/props.js';
import { installArmory } from './systems/armory.js';
import { placeCivic } from './systems/civic.js';
import { installNeeds } from './systems/needs.js';
import { installStrays } from './systems/strays.js';
import { createPowerLines } from './world/powerlines.js';
import { installWounds } from './systems/wounds.js';
import { installStreetCrime } from './systems/streetcrime.js';
import { installAuction } from './systems/auction.js';
import { createWayfinding } from './world/wayfinding.js';
import { installCarCombat } from './systems/carcombat.js';
import { installStreetLife } from './systems/streetlife.js';
import { installWorldEvents } from './systems/world-events.js';
import { installDetails } from './systems/details.js';
import { buildWeaponModel, applyFinish } from './entities/arsenal.js';
import { vehiclesOverlap } from './world/collision.js';
import { LAND } from './assets/catalog.js';
import { BOATS, AIRCRAFT } from './entities/craft.js';
import { ATTACHMENTS } from './entities/arsenal.js';
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
  'Hold Tab (or the gun button on phone) for the weapon wheel. Guns stay holstered until you draw them.',
  'Holster your weapon and focus on an officer to surrender. Cops open fire if you have a gun out.',
  'Lose the police outside the city and you get a bounty. Bounty hunters come every three days.',
  'Hold F (◎ on phone) near someone to greet or antagonize them. Push someone four times and see what happens.',
  'Stop beside someone walking along a country road and offer them a ride.',
  'Press V to cycle the camera, including first person.',
  'Walk into a ledge to climb it. Anything up to about eight feet with a clear top can be mantled.',
  'Redgrass Plains is open hunting land. Sell what you hunt at the trading posts.',
  'Drive into a Calvera Customs workshop to fit parts, paint and repairs.',
  'Pay off your bounty at the Central Precinct to stop the hunters.',
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
  // presets without the post chain (phone/low) get the filmic curve plus the
  // same saturation/contrast grade inside every material's tone mapping
  THREE.ShaderChunk.tonemapping_pars_fragment = THREE.ShaderChunk.tonemapping_pars_fragment.replace(
    'vec3 CustomToneMapping( vec3 color ) { return color; }',
    `vec3 CustomToneMapping( vec3 color ) {
  vec3 c = AgXToneMapping( color );
  float l = dot( c, vec3( 0.2126, 0.7152, 0.0722 ) );
  c = mix( vec3( l ), c, 1.14 );
  c = 0.18 * pow( max( c, 0.0 ) / 0.18, vec3( 1.08 ) );
  return clamp( c, 0.0, 1.0 );
}`);
  renderer.toneMapping = THREE.CustomToneMapping;
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
  collision.terrainCell = terrain.cell; // feet follow the drawn terrain triangles, not the smoother heightmap
  const water = createWater(scene, renderer, q);
  const roads = createRoads(graph, hm, q, scene, collision, surf);
  progress(0.74, 'Building Port Calvera and Mill Creek');
  await nextFrame();
  const city = createBuildings(hm, q, scene, collision, surf, graph);
  const billboards = createBillboards(scene, graph, hm, collision, q);
  createPowerLines(scene, graph, hm, collision, q);
  progress(0.84, 'Growing Pinewood Hollow');
  await nextFrame();
  const veg = await createVegetation(hm, q, scene, collision, city.cityBlocks, (p) => progress(0.84 + p * 0.07, 'Growing forests'), surf, settings.grass === false ? 0 : 1);
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
  // weapons: RDR-style wheel, holsters, per-weapon holds (IK), gun HUD silhouette
  const gunPose = new GunPose(player.h);
  const silhouette = makeSilhouetter(renderer);
  const wheel = new WeaponWheel($('#hud'), combat, (slot, dual) => {
    const was = combat.drawn ? combat.weapon + combat.dual : '';
    combat.equip(slot, dual);
    if (combat.drawn && combat.weapon + combat.dual !== was) { S.drawT = 0.35; audio.thud?.(0.15); }
    S.idleArmed = 0; S.inspectT = 0;
  });
  const eyeL = player.h.model.getObjectByName('eyeL'), eyeR = player.h.model.getObjectByName('eyeR'), headBone = player.h.model.getObjectByName('head');
  const eyePos = new THREE.Vector3(), _e2 = new THREE.Vector3();
  const getEye = () => {
    if (eyeL && eyeR) { eyeL.getWorldPosition(eyePos); eyeR.getWorldPosition(_e2); return eyePos.add(_e2).multiplyScalar(0.5); }
    return headBone ? headBone.getWorldPosition(eyePos).add(_e2.set(0, 0.08, 0)) : eyePos.copy(player.pos).add(_e2.set(0, 1.7, 0));
  };
  // holstered: sidearm on the right hip, long gun slung across the back
  const hipBone = player.h.model.getObjectByName('root'), backBone = player.h.model.getObjectByName('spine02');
  const _hp = new THREE.Vector3(), _hd = new THREE.Vector3(), _hu = new THREE.Vector3(), _hm = new THREE.Matrix4();
  const stow = (m, pos, dir, up) => {
    _hm.lookAt(_hp.set(0, 0, 0), _hd.copy(dir).negate(), up);
    m.quaternion.setFromRotationMatrix(_hm);
    m.position.copy(pos).sub(m.userData.hold ? m.userData.hold.mid.clone().applyQuaternion(m.quaternion) : _hp.set(0, 0, 0));
    m.visible = true; m.updateMatrixWorld(true);
  };
  function showHolstered(shown) {
    if (S.mode !== 'foot' || !player.char.root.visible || rig.fp) return;
    const h = player.heading, fw = new THREE.Vector3(Math.sin(h), 0, Math.cos(h)), right = new THREE.Vector3(-Math.cos(h), 0, Math.sin(h)), up = new THREE.Vector3(0, 1, 0);
    const side = combat.slotWeapon('sidearm');
    if (side && hipBone && !game.isConcealed?.(side) && !(combat.drawn && Combat.slotOf(combat.weapon) === 'sidearm')) {
      const m = combat.model(side, '#hip');
      const p = hipBone.getWorldPosition(new THREE.Vector3()).addScaledVector(right, 0.21).addScaledVector(up, -0.12).addScaledVector(fw, -0.02);
      stow(m, p, _hu.copy(up).multiplyScalar(-1).addScaledVector(fw, 0.18).normalize(), fw.clone().negate());
      shown.push(m);
    }
    const longId = combat.drawn && combat.def.cat !== 'pistol' ? null : ['long', 'shotgun', 'sniper'].map((k) => combat.slotWeapon(k)).find((id) => id && !game.isConcealed?.(id));
    if (longId && backBone) {
      const m = combat.model(longId, '#back');
      const p = backBone.getWorldPosition(new THREE.Vector3()).addScaledVector(fw, -0.15).addScaledVector(up, 0.08);
      stow(m, p, _hu.copy(up).multiplyScalar(0.75).addScaledVector(right, -0.66).normalize(), fw.clone().negate());
      shown.push(m);
    }
  }

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
  const fpState = { boost: false };
  const applySize = () => {
    // first person draws less of the world, so it spends the savings on sharpness
    const pr = baseRatio() * dynScale * (fpState.boost ? 1.25 : 1);
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
  S.lastVehicle = null; // you start without a car (the one parked by the spawn belongs to someone else)
  const arsenalUI = new ArsenalUI({
    combat, getMoney: () => S.money, pause: (b) => { S.frozen = b; },
    spend: (n) => { if (S.money < n) { hud.toast('Not enough money', 1.2); return false; } S.money -= n; return true; },
  });
  arsenalUI.enable();
  const toggleFreeCam = () => { rig.free = !rig.free; hud.toast(rig.free ? 'Free camera: look around freely (C to turn off)' : 'Camera follows the vehicle', 1.8); };
  addEventListener('keydown', (e) => { if (e.code === 'KeyC' && !e.repeat) toggleFreeCam(); });

  // ---- career (save game), interaction points and the gameplay systems ----
  const profile = loadProfile() || newProfile();
  // "Start with nothing": older saves got a free 9mm, Rico's pickup, a waistband holster and
  // two bandages from the old opening. Take back exactly those freebies once; anything you
  // bought or earned stays. (The 9mm couldn't be bought before, so any in an old save was free.)
  // Very old saves also carry the first build's free loadout: one of every weapon type.
  const FREEBIES = ['pistol', 'rifle_01', 'shotgun_01', 'marksman_01', 'sniper_01', 'bow_01', 'launcher_01'];
  if ((profile.nothingMig || 0) < 2) {
    const W = profile.weapons || (profile.weapons = {});
    if (Array.isArray(W.owned)) for (const id of FREEBIES) if (W.owned.includes(id)) { W.owned = W.owned.filter((x) => x !== id); if (W.ammo) delete W.ammo[id]; if (W.count) delete W.count[id]; }
  }
  if (!profile.nothingMig) {
    const W = profile.weapons || (profile.weapons = {});
    if (Array.isArray(profile.garage)) profile.garage = profile.garage.filter((g) => g.type !== 'rusty-pickup');
    if (profile.gearMig && Array.isArray(profile.gearOwned)) { profile.gearOwned = profile.gearOwned.filter((k) => k !== 'holster:iwb'); if (profile.gear?.holster === 'iwb') profile.gear.holster = 'owb'; }
    if (profile.med && profile.med.bandage === 2 && Object.keys(profile.med).length === 1) profile.med = {};
    profile.ricoTruck = false;
  }
  profile.nothingMig = 2;
  S.money = profile.money;
  if (profile.weapons.owned) { for (const id of profile.weapons.owned) combat.give(id); Object.assign(combat.ammo, profile.weapons.ammo || {}); }
  const career = new Career(profile, {
    getMoney: () => S.money, setMoney: (n) => { S.money = Math.max(0, Math.round(n)); }, toast: (m, t) => hud.toast(m, t),
    snapshot: (p) => {
      p.money = S.money; p.hour = sky.hour; p.day = sky.day; p.weather = weather.kind;
      p.pos = [+player.pos.x.toFixed(1), +player.pos.z.toFixed(1)];
      p.weapons = { ...p.weapons, owned: combat.owned.slice(), ammo: combat.ammo }; // keep counts and finishes
    },
  });
  sky.hour = profile.hour; sky.day = profile.day;
  const interact = new Interactions(scene, hm);
  const game = {
    S, scene, hm, graph, city, player, combat, hud, sky, weather, career, interact, parked, lib, q, settings, camera, input, traffic, peds, police, collision, rig, surf,
    pause: (b) => { S.frozen = b; },
    teleport: (x, z, heading = 0) => { api.teleport(x, z, heading); },
    enterVehicle: (v) => enterVehicle(v, null),
    exitVehicle: () => { if (S.mode === 'car') exitVehicle(); },
    vehicle: () => S.vehicle,
  };
  // public services first, so jobs, arrests and the hospital use the real buildings
  const HOSPITAL = { x: CITY.x0 + CITY.nx * CITY.pitch + 24, z: CITY.z0 + 2 * CITY.pitch, name: 'Port Calvera Medical Center' };
  const PRECINCT = { x: CITY.x0 - 24, z: CITY.z0 + 1 * CITY.pitch, name: 'Calvera PD · Central Precinct' };
  game.PRECINCT = PRECINCT; game.HOSPITAL = HOSPITAL;
  game.Vehicle = game.Vehicle || Vehicle;
  const civic = placeCivic(game, { PRECINCT, HOSPITAL });
  const systems = installSystems(game);
  // scenery bullets can hit (tree trunks, rocks, street poles, piers, hangar)
  const hitStatics = [];
  const indoorMeshes = () => { const a = []; if (S.indoors) S.indoors.it.g.traverse((o) => { if (o.isMesh && !o.userData.noHit) a.push(o); }); return a; };
  scene.traverse((o) => { if (o.userData.hitStatic) hitStatics.push(o); });

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
  // fewer on-screen buttons: phone, arsenal and the free camera live in the pause menu
  $('#pause-phone').onclick = () => { setPaused(false); systems.phoneSys?.phone?.show('inv'); };
  $('#pause-arsenal').onclick = () => { setPaused(false); api.openArsenal?.(); };
  $('#pause-cam').onclick = () => { setPaused(false); toggleFreeCam(); };

  hud.toast(settings.isTouch
    ? 'Welcome to Calvera. Tap 🚗 near a car to drive · 🔫 switch weapon · 🎯 aim · 💥 fire'
    : 'Welcome to Calvera. F: drive · Q: switch weapon · Right mouse: aim · Left mouse: fire', 7);

  // ---- combat, wanted level, death & arrest
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
  const hurtPlayer = (amount, from, pen) => {
    if (S.dead) return;
    if (game.armorHit && S.mode !== 'car') amount = game.armorHit(amount, from, pen ?? 2);
    if (S.mode === 'car') { damageVehicle(S.vehicle, amount * 0.6, from ? from.x : S.vehicle.pos.x, from ? from.z : S.vehicle.pos.z + 1); player.damage(amount * 0.35); }
    else player.damage(amount);
    S.dmgFlash = Math.min(1, S.dmgFlash + 0.35);
  };
  police.onPlayerHit = (amount, from, pen) => hurtPlayer(amount, from, pen);
  const respawn = (at, title, sub, fee) => {
    if (S.indoors && game.estate) game.estate.leave();
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
  // talking to people, the police, arrests and bounty hunters
  const explodeAt = (pt, dmg = 140) => {
    combat.explode(pt, { explosive: 6, damage: dmg }, { peds, vehicles: [...traffic.cars.map((c) => c.v), ...police.cars.map((c) => c.v), ...parked], animals: [] }, pt);
    if (S.mode === 'foot' && player.pos.distanceTo(pt) < 6) hurtPlayer(dmg * (1 - player.pos.distanceTo(pt) / 6) * 0.5, pt);
    else if (S.mode === 'car' && S.vehicle.pos.distanceTo(pt) < 7) hurtPlayer(dmg * 0.4, pt);
  };
  police.onShell = (pt) => explodeAt(pt, 180);
  const law = installLaw({ ...game, hurtPlayer, PRECINCT, Vehicle: game.Vehicle || Vehicle, gunPose, audio, wheelOpen: () => wheel.open, explodeAt,
    tracer: (a, b) => combat.tracer(a, b), get rig() { return rig; } });
  game.law = law;
  const roadside = installRoadside({ ...game, setWaypoint: game.setWaypoint });
  game.roadside = roadside;
  // John Cortes, the Gulf Line crew, the hideout and the prologue
  Object.assign(game, {
    Vehicle,
    lastVehicle: () => S.vehicle || S.lastVehicle || null,
    parkedNear: (p, r) => parked.filter((v) => v.uid && Math.hypot(v.pos.x - p.x, v.pos.z - p.z) < r),
    sellVehicle: (v) => { const i = parked.indexOf(v); if (i >= 0) parked.splice(i, 1); scene.remove(v.group); const gi = career.p.garage.findIndex((g) => g.uid === v.uid); if (gi >= 0) career.p.garage.splice(gi, 1); if (S.lastVehicle === v) S.lastVehicle = null; },
    giveAttachment: (id) => { const W = career.p.weapons; W.mods = W.mods || {}; W.mods.owned = W.mods.owned || []; if (!W.mods.owned.includes(id)) W.mods.owned.push(id); hud.toast('New attachment in your arsenal', 2.5); },
  });
  const gang = installGang(game);
  game.gang = gang;
  // gunsmiths: silhouettes for the store list, finishes on your guns, attachments per gun
  const silCache = {};
  combat.finishOf = (id) => career.p.weapons.finish?.[id];
  Object.assign(game, {
    silhouetteOf: (id) => silCache[id] || (silCache[id] = silhouette('store:' + id, buildWeaponModel(WEAPONS[id]))),
    applyFinishTo: (id) => { for (const [k, m] of Object.entries(combat.models)) if (k === id || k.startsWith(id + '#')) applyFinish(m, combat.finishOf(id)); },
    fitAttachment: (id, attId) => {
      const a = ATTACHMENTS.find((x) => x.id === attId), w = WEAPONS[id];
      if (!a || !w || w.melee) return;
      const mods = combat.mods || (combat.mods = {}), slots = mods[id] || (mods[id] = {});
      if (slots[a.slot] === a.id) return;
      if (!career.spend(a.price)) return;
      slots[a.slot] = a.id;
      const base = combat.base || (combat.base = {});
      if (!base[id]) base[id] = { ...w };
      Object.assign(w, base[id]);
      for (const pid of Object.values(slots)) {
        const m = ATTACHMENTS.find((x) => x.id === pid).mods;
        if (m.damage) w.damage = Math.round(w.damage * m.damage);
        if (m.spread) w.spread *= m.spread;
        if (m.range) w.range = Math.round(w.range * m.range);
        if (m.rate) w.rate *= m.rate;
        if (m.clip) w.clip = Math.round(w.clip * m.clip);
        if (m.recoil) w.recoil *= m.recoil;
        if (m.silent) w.silent = true;
        if (m.zoom) w.scope = m.zoom;
      }
      hud.toast(`${a.name} fitted to your ${w.name}`, 2.2);
    },
  });
  const gunStores = installGunStores(game);
  const shops = installShops(game);
  game.billboards = billboards;
  const armory = installArmory(game);
  const needs = installNeeds(game);
  const strays = installStrays(game);
  game.tracer = game.tracer || ((a, b) => combat.tracer(a, b));
  police.patrols = () => traffic.cars.filter((c) => c.v.patrol).map((c) => c.v);
  const streetCrime = installStreetCrime(game);
  const wounds = installWounds(game);
  const auction = installAuction(game);
  // every place worth finding: road signs point to them, the phone lists them
  game.places = [
    ...(game.gunShops || []).map((s) => ({ name: s.name, kind: 'Gunsmith', icon: '🔫', x: s.x, z: s.z })),
    ...(game.armorShops || []).map((s) => ({ name: s.name, kind: 'Armour & medical', icon: '🦺', x: s.x, z: s.z })),
    ...(game.shopSpots || []).map((s) => ({ name: s.name, kind: s.kind === 'mart' ? 'Food & drink' : 'Clothing', icon: s.kind === 'mart' ? '🥪' : '👕', x: s.x, z: s.z })),
    ...(game.hardwareShops || []).map(([x, z, name]) => ({ name, kind: 'Hardware', icon: '🔨', x, z })),
    ...(game.barbers || []).map(([x, z, name]) => ({ name, kind: 'Barber', icon: '✂️', x, z })),
    ...(game.auctionHouse ? [{ name: game.auctionHouse.name, kind: 'Property & vehicle auction', icon: '🔨', x: game.auctionHouse.x, z: game.auctionHouse.z }] : []),
  ];
  const wayfinding = createWayfinding(game, game.places.filter((p) => p.kind !== 'Barber'));
  game.wayfinding = wayfinding;
  combat.ammoType = { ...(career.p.weapons.ammoType || {}) };
  Object.assign(game, { hurtPlayer });
  const carCombat = installCarCombat(game, { explodeAt });
  const props = installProps(game);
  game.props = props;
  game.onDriverKilled = (v) => { if (witnesses(v.pos, 40) || police.nearPolice(60)) police.crime(v.type === 'police' ? 'copKill' : 'kill'); peds.panic(v.pos, 30); };
  game.refreshHitStatics = () => { hitStatics.length = 0; scene.traverse((o) => { if (o.userData.hitStatic) hitStatics.push(o); }); };
  installStreetLife(game);
  const worldEvents = installWorldEvents(game);
  game.audio = audio;
  game.nearestRoadPoint = (x, z) => { const r = nearestRoad(x, z); if (!r) return null; const p = {}; traffic.sampleEdge(r.e, r.s, p); return p; };
  const details = installDetails(game);
  game.onCarExploded = (v) => { peds.panic(v.pos, 50); if (witnesses(v.pos, 60) || police.nearPolice(80)) police.crime(v.type === 'police' ? 'copKill' : 'kill'); };
  const reportHit = (hit) => {
    if (!hit || hit.kind !== 'ped') return;
    if (hit.ped.role === 'hunter' || hit.ped.role === 'brawler') { S.hitMarker = true; return; } // self-defence
    const cop = hit.ped.role === 'cop';
    if (cop) hit.ped.provoked = true;
    const kind = hit.killed ? (cop ? 'copKill' : 'kill') : cop ? 'copShot' : 'assault';
    if (game.reportCrime) game.reportCrime(kind, hit.ped.pos, hit.ped); else police.crime(kind);
    S.hitMarker = true;
  };
  const witnesses = (pos, r) => peds.list.some((p) => p.mode !== 'dead' && p.pos.distanceTo(pos) < r);
  const aimDir = new THREE.Vector3(), muzzle = new THREE.Vector3(), _fa = new THREE.Vector3();

  const tmpV = new THREE.Vector3();
  const _sunC = new THREE.Color();
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
    } else {
      parked.splice(parked.indexOf(v), 1);
      // a parked car that isn't yours: that's car theft if anyone sees it
      if (!v.uid && !v.issued && !v.taken && !v.isAir && !v.isBoat) {
        v.taken = true;
        if (police.nearPolice(60)) police.crime('carjack');
        else if (witnesses(v.pos, 30)) { if (game.reportCrime) game.reportCrime('theft', v.pos); else police.crime('theft'); }
      }
    }
    S.mode = 'car'; S.vehicle = v;
    combat.hideAll(); combat.holstered = true; if (wheel.open) wheel.hide(false);
    v.onHitPed = (p, killed) => { if (killed) police.crime(p.role === 'cop' ? 'copKill' : 'kill'); else police.crime('assault'); peds.panic(p.pos, 25); };
    player.char.root.visible = false;
    hud.toast(`${v.spec.name}`, 2.5);
  }
  // walk round to the driver's door, open it, climb in (parked cars)
  function beginEnter(v, fromTraffic) {
    if (fromTraffic || v.isBoat || v.isAir) return enterVehicle(v, fromTraffic);
    const left = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading)), fwd = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
    const at = v.pos.clone().addScaledVector(left, v.spec.width / 2 + 0.55).addScaledVector(fwd, (v.spec.wf || 1.3) * 0.2);
    combat.holstered = true;
    S.entering = { v, t: 0, phase: 0, at, door: v.group.getObjectByName('door-drv') };
  }
  function updateEnter(dt) {
    const e = S.entering, v = e.v;
    e.t += dt;
    if (e.phase === 0) {
      const d = new THREE.Vector3().subVectors(e.at, player.pos); d.y = 0;
      const L = d.length();
      if (L > 0.25 && e.t < 2.2) {
        player.heading += wrapAngle(Math.atan2(d.x, d.z) - player.heading) * Math.min(1, dt * 8);
        const sp = Math.min(3.4, L * 3);
        player.pos.addScaledVector(d.normalize(), sp * dt);
        player.pos.y = collision.surface(player.pos.x, player.pos.z, player.pos.y + 0.5);
        const [clip, k] = locomotion(sp); player.h.play(clip, 0.2, k);
      } else { e.phase = 1; e.t = 0; player.h.play('Interact', 0.1, 1.5, true); }
    } else if (e.phase === 1) {
      player.heading += wrapAngle(v.heading - Math.PI / 2 - player.heading) * Math.min(1, dt * 10); // face the door
      if (e.door) e.door.rotation.y = e.door.userData.open * Math.min(1, e.t / 0.45);
      if (e.t > 0.6) { e.phase = 2; S.entering = null; if (e.door) S.doorClose = { door: e.door, t: 0 }; enterVehicle(v, null); return; }
    }
    player.h.update(dt);
    player.h.root.position.copy(player.pos); player.h.root.rotation.y = player.heading;
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
    { const door = v.group.getObjectByName('door-drv'); if (door) { door.rotation.y = door.userData.open; S.doorClose = { door, t: -0.35 }; } }
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
    // ---- weapon wheel (time slows while it is open)
    if (S.mode === 'foot' && a.wheel && S.dead <= 0) {
      if (!wheel.open) { S.wheelT = 0; wheel.show(); }
      S.wheelT += dt;
      if (S.wheelT > 0.12) wheel.el.classList.add('show'); // a quick tap never flashes the wheel
      if (a.wheelTouch) wheel.point(a.wheelDX, a.wheelDY, true); else wheel.point(a.lookX, a.lookY);
      if (a.zoom) wheel.cycle(Math.sign(a.zoom));
      if (a.wheelPrev) wheel.cycle(-1);
      if (a.wheelNext) wheel.cycle(1);
      a.lookX = a.lookY = 0; a.zoom = 0; a.fire = a.firePressed = false;
    } else if (wheel.open) {
      if (S.wheelT < 0.2) { wheel.hide(false); a.holster = true; } // quick tap: holster / draw
      else wheel.hide(true);
    }
    if (wheel.open && S.wheelT > 0.12) dt *= 0.3;
    if (a.holster && S.mode === 'foot') {
      if (combat.drawn) combat.holstered = true;
      else if (!combat.def.melee) { combat.holstered = false; S.drawT = 0.35; }
      else { const id = combat.slotWeapon('sidearm'); if (id) { combat.equip('sidearm'); S.drawT = 0.35; } }
      S.idleArmed = 0;
    }
    // focusing on someone (hold F / ◎, or hold aim with your gun away) talks instead of drawing
    const focusOn = S.mode === 'foot' && !combat.drawn && (a.interact || a.aim) && law.target();
    if (focusOn) a.aim = false;
    // aiming or shooting with your gun away draws it (RDR style)
    else if (S.mode === 'foot' && combat.holstered && !combat.def.melee && (a.aim || a.firePressed) && S.dead <= 0) { combat.holstered = false; S.drawT = 0.3; }
    S.drawT = Math.max(0, (S.drawT || 0) - dt);
    if (S.drawT > 0) a.fire = a.firePressed = false;
    if (a.reload && combat.drawn && combat.reload() && combat.def.cat === 'pistol') player.h.play('Pistol_Reload', 0.1, (1.5 / combat.reloadDur) * 1.0, true);
    const armed = combat.drawn;
    if (armed && (a.fire || a.firePressed)) S.aimHold = 0.7;
    S.aimHold = Math.max(0, S.aimHold - dt);
    if (S.aimHold > 0 && armed) a.aim = true;
    combat.update(dt);
    if (law.cutscene) {
      focus.copy(player.pos);
    } else if (S.entering) {
      updateEnter(dt);
      focus.copy(player.pos);
    } else if (S.mode === 'foot') {
      needs.update(dt, a);
      if (S.limp) { a.sprint = false; if (a.moveX) a.moveX *= 0.5; if (a.moveY) a.moveY *= 0.5; }
      player.update(dt, a, rig.yaw, hm, collision, armed && combat.def.cat === 'pistol');
      camera.getWorldDirection(aimDir);
      // ---- weapon in the hands: pose the arms around it
      const shown = [];
      if (armed && S.dead <= 0) {
        const m = combat.model(), mL = combat.dual ? combat.model(combat.offhand, '#L') : null;
        m.visible = true; shown.push(m); if (mL) { mL.visible = true; shown.push(mL); }
        const moving = player.speed > 0.2 || a.aim || a.fire || combat.reloading > 0;
        S.idleArmed = moving ? 0 : (S.idleArmed || 0) + dt;
        if (S.inspectT > 0) { S.inspectT += dt; if (S.inspectT > 3.2 || moving) S.inspectT = 0; }
        else if (S.idleArmed > 7) { S.inspectT = 0.001; S.idleArmed = -6; } // idle: check the weapon over
        const st = combat.reloading > 0 ? 'reload' : player.aiming ? 'aim' : S.inspectT > 0 ? 'inspect' : player.speed > 5.6 ? 'sprint' : 'ready';
        const info = m.userData.hold;
        if (info && info.kind !== 'launcher') {
          gunPose.apply({ gun: m, gunL: mL, info, state: st, aimDir, heading: player.heading, reload: 1 - combat.reloading / combat.reloadDur,
            inspect: S.inspectT / 3.2, fp: rig.fp, eye: getEye().clone(), dual: combat.dual });
        }
        combat.gun = combat.dual && combat._side && mL ? mL : m;
        // hands that hold the gun: fingers wrapped, trigger finger along the frame until it fires
        if (info && info.kind !== 'launcher') { gunPose.curl('R', 'pistol', S.gunKick || 0); if (!combat.dual) gunPose.curl('L', info.kind === 'pistol' || info.kind === 'revolver' ? 'cup' : 'fore'); }
        if (S.gunKick > 0.01) { m.position.addScaledVector(aimDir, -S.gunKick * 0.045); m.rotateX(-S.gunKick * 0.14); m.updateMatrixWorld(true); }
        // draw: the gun comes up from the holster
        if (S.drawT > 0) { const k = S.drawT / 0.35; m.position.y -= k * 0.35; m.updateMatrixWorld(true); }
      }
      // a knife, bat or other hand weapon: in the right hand
      if (!armed && !combat.holstered && combat.def.melee && combat.weapon !== 'fists' && S.dead <= 0 && player.char.root.visible) {
        const m = combat.model(); m.visible = true; shown.push(m);
        player.h.root.updateMatrixWorld(true); gunPose.attachToHand(m, gunPose.R);
      }
      showHolstered(shown);
      combat.hideAll(shown);
      // look at whoever you're talking to
      if (law.focusing && game.lookAt && headBone) {
        const tq = new THREE.Quaternion(), d = new THREE.Vector3().subVectors(game.lookAt, player.pos);
        const yaw = Math.max(-1, Math.min(1, wrapAngle(Math.atan2(d.x, d.z) - player.heading)));
        headBone.getWorldQuaternion(tq);
        tq.premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), yaw * 0.8));
        const pq = headBone.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
        headBone.quaternion.copy(pq.multiply(tq));
      }
      const targets = { peds, vehicles: [...traffic.cars.map((c) => c.v), ...police.cars.map((c) => c.v), ...parked, ...(law.heli() ? [law.heli()] : [])], animals: game.hunting ? game.hunting.list : [], statics: S.indoors ? indoorMeshes() : hitStatics };
      // what the reticle is on: one of your crew (grey: the gun won't fire), a threat (red),
      // or a civilian, who reacts to having a gun pointed at them
      S.aimFriend = false; S.aimHostile = false;
      if (armed && player.aiming && S.mode === 'foot') {
        const o = camera.position;
        for (const fp of game.friendlies?.() || []) {
          _fa.set(fp.x - o.x, fp.y + 1.0 - o.y, fp.z - o.z);
          const t = _fa.dot(aimDir); if (t < 0 || t > 90) continue;
          if (_fa.addScaledVector(aimDir, -t).length() < 0.45) { S.aimFriend = true; break; }
        }
        const pr = peds.raycast(o.clone(), aimDir.clone(), 40);
        if (pr && pr.p) {
          const p = pr.p;
          S.aimHostile = ['foe', 'hunter', 'rival', 'armedciv', 'mugger'].includes(p.role) || (p.role === 'cop' && police.wanted > 0);
          if ((!p.role || p.role === 'handsup') && p.mode !== 'dead' && !p.wound?.down) game.aimedAt?.(p);
        }
      }
      hud.cross.classList.toggle('friend', S.aimFriend); hud.cross.classList.toggle('hostile', !S.aimFriend && S.aimHostile);
      if (armed && a.firePressed && player.aiming && S.aimFriend) { audio.click?.(1); hud.toast('You can\'t shoot your own crew.', 1.2); }
      else if (armed && a.firePressed && game.safetyOn?.()) { audio.thud?.(0.05); hud.toast('Safety is on (K)', 1); }
      else if (armed && a.fire && player.aiming && !S.aimFriend && combat.cooldown <= 0 && S.dead <= 0) {
        combat.muzzleWorld(muzzle);
        const hit = combat.attack(camera.position.clone(), aimDir.clone(), muzzle.clone(), targets, player.pos);
        if (combat.fired) {
          // recoil: the muzzle climbs and the gun shoves back; each gun by its own recoil
          const w = combat.fired; combat.fired = null;
          const k = (w.recoil || 0.05) * (w.cat === 'shotgun' ? 1.5 : w.cat === 'sniper' || w.cat === 'marksman' ? 1.25 : w.cat === 'launcher' ? 1.8 : 1) * (S.scoped ? 0.6 : 1);
          S.kick = (S.kick || 0) + k * 0.9; rig.pitch += k * 0.9; rig.yaw += (Math.random() - 0.5) * k * 0.6;
          S.gunKick = Math.min(1.2, (S.gunKick || 0) + 0.25 + k * 5);
        }
        if (hit) game.onShotEffects?.(combat.gun, combat.def);
        if (hit) {
          player.h.play('Pistol_Shoot', 0.04, 1.6, true);
          reportHit(hit);
          if (witnesses(player.pos, 45)) { if (game.reportCrime) game.reportCrime('shots', player.pos, hit.ped); else police.crime('shots'); } else game.onShotFired?.(player.pos);
          peds.panic(player.pos, 45);
          if (hit.kind === 'vehicle' && hit.vehicle.type === 'police') police.crime('copShot');
        }
      } else if (!armed && a.firePressed && S.dead <= 0) {
        const fwd = new THREE.Vector3(Math.sin(player.heading), 0, Math.cos(player.heading));
        const hit = combat.attack(player.pos, fwd, null, targets, player.pos);
        if (hit) { const k = combat.def.kind; player.h.play(k === 'blade' ? (Math.random() < 0.75 ? 'Punch_Jab' : 'Punch_Cross') : k === 'blunt' ? 'Punch_Cross' : Math.random() < 0.5 ? 'Punch_Jab' : 'Punch_Cross', 0.06, k === 'blunt' ? 1.05 : 1.3, true); reportHit(hit); if (hit.ped) peds.panic(hit.ped.pos, 15); }
      }
      // vehicles are solid: push the player out of their exact footprints
      for (const v of [...parked, ...traffic.cars.map((c) => c.v), ...police.cars.map((c) => c.v)]) {
        if (v.isAir && v.alt > 1) continue;
        const dx = player.pos.x - v.pos.x, dz = player.pos.z - v.pos.z;
        if (Math.abs(dx) > 10 || Math.abs(dz) > 10 || player.pos.y > v.pos.y + (v.spec.height || 1.5)) continue;
        const fx = Math.sin(v.heading), fz = Math.cos(v.heading), lu = dx * fx + dz * fz, lv = dx * fz - dz * fx;
        const hz = v.spec.len / 2, hx = v.spec.width / 2, r = 0.32;
        const cu = Math.max(-hz, Math.min(hz, lu)), cv = Math.max(-hx, Math.min(hx, lv));
        let eu = lu - cu, ev = lv - cv, d = Math.hypot(eu, ev);
        if (d >= r) continue;
        if (d < 1e-6) { const ou = hz - Math.abs(lu), ov = hx - Math.abs(lv); if (ou < ov) { eu = Math.sign(lu) || 1; ev = 0; d = 0; cu === lu; } else { ev = Math.sign(lv) || 1; eu = 0; } const pu = eu ? Math.sign(lu) * (hz + r) : lu, pv = ev ? Math.sign(lv) * (hx + r) : lv; player.pos.x = v.pos.x + fx * pu + fz * pv; player.pos.z = v.pos.z + fz * pu - fx * pv; continue; }
        const k = (r - d) / d;
        player.pos.x += (fx * eu + fz * ev) * k; player.pos.z += (fz * eu - fx * ev) * k;
      }
      // nearby car?
      let best = null, bd = 4.2, fromTraffic = null;
      for (const v of parked) { const d = v.pos.distanceTo(player.pos) - (v.isBoat || v.isAir ? v.radius * 0.8 : 0); if (d < bd) { bd = d; best = v; } }
      const tc = traffic.nearest(player.pos, bd);
      if (tc) { best = tc.v; fromTraffic = tc; }
      if (best && !S.entering) {
        prompt = settings.isTouch ? `Tap ◎ to get in the ${best.spec.name}` : `Press F to get in the ${best.spec.name}`;
        if (a.enter) beginEnter(best, fromTraffic);
      }
      focus.copy(player.pos);
    } else {
      const v = S.vehicle;
      const ctl = S.auto ? autopilot(v, dt) : { throttle: a.throttle, brake: a.brake, steer: -a.moveX, handbrake: a.handbrake, nitro: a.sprint };
      v.physics(dt, ctl, hm, collision);
      if (v.isAir) prompt = `ALT ${Math.round(v.alt)} m · ${v.heli ? 'Space/Shift up-down, W/S tilt, A/D turn' : `PWR ${Math.round(v.power * 100)}% · W/S power, Space/Shift pitch, A/D bank`}`;
      for (const p of v.isAir || v.isBoat ? [] : parked) {
        if (p.isBoat || p.isAir || Math.abs(p.pos.x - v.pos.x) > 14 || Math.abs(p.pos.z - v.pos.z) > 14) continue;
        const m = vehiclesOverlap(v, p); // exact footprints
        if (m) { v.pos.x += m.nx * m.d; v.pos.z += m.nz * m.d; const vn = v.vel.x * m.nx + v.vel.y * m.nz; if (vn < 0) { v.vel.x -= m.nx * vn * 1.2; v.vel.y -= m.nz * vn * 1.2; } v.vel.multiplyScalar(0.8); v.impact = Math.max(v.impact, Math.max(3, -vn)); }
      }
      v.night = sky.night;
      v.sync(dt);
      if (v.impact > 4) rig.shake = Math.min(1, v.impact / 15);
      if (v.impact > 4 && !v._hitLatch) { v._hitLatch = true; const f = v.forward ? v.forward() : { x: 0, z: 1 }, dir = (v.speed || 0) >= 0 ? 1 : -1; damageVehicle(v, (v.impact - 3) * 2.2, v.pos.x + f.x * 3 * dir, v.pos.z + f.z * 3 * dir); }
      if (v.impact < 1) v._hitLatch = false;
      if (a.enter && roadside.canOffer()) { roadside.offer(); a.enter = false; }
      if (a.enter && (Math.abs(v.speed) < 6 || v.isAir)) exitVehicle();
      else if (a.enter) prompt = 'Slow down to get out';
      if (v.drowned) prompt = 'The engine is flooded — press F to get out';
      focus.copy(v.pos);
    }
    for (const p of parked) { p.night = sky.night; p.sync(dt); }
    if (S.doorClose) { const dc = S.doorClose; dc.t += dt; dc.door.rotation.y = dc.door.userData.open * Math.max(0, 1 - dc.t / 0.5) * (dc.t < 0.15 ? 1 : 1); if (dc.t > 0.5) S.doorClose = null; }
    if (!S.dead) {
      const ip = interact.update(dt, focus, S.mode === 'car', S.mode === 'foot' && a.enter && !prompt, S.vehicle ? S.vehicle.speed : 0);
      if (!prompt) prompt = ip;
    }
    const sp = systems.update(dt, a, !prompt && !interact.consumed && S.mode === 'foot' && !S.dead);
    if (!prompt && sp) prompt = sp;
    const lp = law.update(dt, a);
    if (lp && (law.focusing || !prompt)) prompt = lp;
    const rp = roadside.update(dt, a);
    if (rp && !prompt) prompt = rp;
    const gp = gang.update(dt, a);
    if (gp && !prompt) prompt = gp;
    gunStores.update(dt);
    shops.update(dt);
    billboards.update(sky.hour);
    carCombat.update(dt);
    props.update(dt);
    armory.update(dt);
    civic.update(dt);
    strays.update(dt);
    wounds.update(dt);
    streetCrime.update(dt);
    auction.update(dt);
    wayfinding.update(dt);
    worldEvents.update(dt);
    details.update(dt);
    career.update(dt);
    if (S.vehicle && S.vehicle.health <= 0 && !S.vehicle.wrecked) { S.vehicle.wrecked = true; hud.toast('The engine is wrecked — get out (F)', 4); }
    if (S.vehicle?.wrecked) { S.vehicle.vel.multiplyScalar(Math.exp(-3 * dt)); }

    const onFoot = S.mode === 'foot' ? player.pos : null;
    // recoil recovers; gunshots echo off the streets, rooms or open country
    if (S.kick > 0) { const back = S.kick * Math.min(1, dt * 7); rig.pitch -= back * 0.75; S.kick -= back; }
    if (S.gunKick) S.gunKick *= Math.exp(-dt * 14);
    { const rg = regionAt(focus.x, focus.z); audio.env = S.indoors ? 'indoors' : rg.sub === 'City' || rg.sub === 'Town' ? 'city' : 'open'; }
    // the city by the clock: fewer people and cars late at night, more patrols
    {
      const hr = sky.hour, late = hr < 5 || hr >= 23.5 ? 1 : hr < 6.5 || hr >= 21 ? 0.55 : 0;
      peds.baseMax = peds.baseMax || peds.max; traffic.baseMax = traffic.baseMax || traffic.max;
      peds.max = Math.max(4, Math.round(peds.baseMax * (1 - 0.72 * late)));
      traffic.max = Math.max(3, Math.round(traffic.baseMax * (1 - 0.6 * late)));
      traffic.patrolK = 0.05 + 0.13 * late;
      if ((S.thinT = (S.thinT || 0) - dt) <= 0) {
        S.thinT = 1.5;
        const civ = peds.list.filter((p) => !p.role && p.mode !== 'dead' && !p.wound?.down);
        if (civ.length > peds.max + 3) {
          // someone out of sight heads home
          const far = civ.map((p) => [p.pos.distanceTo(focus), p]).filter(([d]) => d > 55).sort((a, b) => b[0] - a[0])[0];
          if (far) { const p = far[1]; scene.remove(p.h.root); p.h.dispose(); peds.list.splice(peds.list.indexOf(p), 1); }
        }
      }
    }
    peds.update(dt, focus, onFoot, [S.vehicle, ...police.cars.map((c) => c.v), ...traffic.cars.map((c) => c.v)], (amt) => { S.money += amt; hud.toast(`+$${amt}`, 1.2); });
    police.update(dt, { pos: S.indoors ? new THREE.Vector3(S.indoors.d.x, focus.y, S.indoors.d.z) : focus, inCar: S.mode === 'car', speed: S.mode === 'car' ? S.vehicle.speed : player.speed, vehicle: S.vehicle, drawn: combat.drawn && S.mode === 'foot' });
    if (player.health > 0 && player.health < 100 && S.dead <= 0) player.health = Math.min(player.maxHealth || 100, player.health + dt * (police.wanted || S.noRegen ? 0 : 0.6));
    S.dmgFlash = Math.max(0, S.dmgFlash - dt * 0.8);
    if (post) post.grade.uniforms.uDamage.value = Math.max(S.dmgFlash, player.health < 25 ? 0.35 : 0);

    traffic.max = Math.round(basePreset.traffic * settings.trafficDensity);
    traffic.update(dt, focus, S.vehicle, S.mode === 'foot' ? player.pos : null, sky.night,
      [...peds.list.filter((p) => p.mode !== 'dead' && p.pos.distanceTo(focus) < 120), ...police.cars.map((c) => c.v)]);
    weather.update(dt, (dt * settings.timeScale) / 120, camera, !S.weatherLocked);
    sky.update(dt, settings.timeScale, focus);
    // looking through a scope: first-person, magnified, the body hidden
    const scoped = S.mode === 'foot' && player.aiming && armed && (combat.def.scope || 0) >= 2 && S.dead <= 0;
    if (scoped && a.sprint && (S.breath ?? 4) > 0) { S.breath = (S.breath ?? 4) - dt; S.steady = Math.min(1, (S.steady || 0) + dt * 4); } else { S.breath = Math.min(4, (S.breath ?? 4) + dt * 0.8); S.steady = Math.max(0, (S.steady || 0) - dt * 2); }
    if (scoped !== !!S.scoped) { S.scoped = scoped; document.body.classList.toggle('scoped', scoped); player.h.model.visible = !scoped; if (scoped) hud.toast('Hold Shift to hold your breath', 1.6); }
    if (scoped) for (const m of Object.values(combat.models)) m.visible = false;
    rig.update(dt, a, focus, { vehicle: S.vehicle, heading: S.vehicle?.heading, speed: S.vehicle?.speed || 0, lastLook: input.lastLookTime, aiming: S.mode === 'foot' && player.aiming && armed, eye: S.mode === 'foot' && player.char.root.visible ? getEye() : null, scope: scoped ? combat.def.scope : 0, steady: Math.max(S.steady || 0, game.buffs?.steady > 0 ? 0.55 : 0) }, collision);

    law.camera(camera);
    gang.camera(camera);
    if (!!rig.fp !== fpState.boost) {
      fpState.boost = !!rig.fp;
      const R = q.shadowRange * (fpState.boost ? 0.5 : 1), sc = sky.sun.shadow.camera; // tighter shadow map = crisper shadows
      Object.assign(sc, { left: -R, right: R, top: R, bottom: -R }); sc.updateProjectionMatrix();
      applySize();
      player.h.model.traverse((o) => { if (o.isSkinnedMesh) o.castShadow = true; });
      hud.toast(fpState.boost ? 'First person' : 'Third person', 1.2);
      game.setHeadwearVisible?.(!fpState.boost);
    }
    const dd = basePreset.drawDistance * settings.drawDistance;
    terrain.update(camera.position, dd);
    veg.update(camera.position, dd);
    if (veg.cover.update) {
      veg.cover.update(camera.position, sky.sunDir, _sunC.copy(sky.sun.color).multiplyScalar(sky.sun.intensity), weather);
      const pp = S.mode === 'foot' ? player.pos : S.vehicle ? S.vehicle.pos : focus;
      veg.cover.push(0, pp.x, pp.y, pp.z, S.mode === 'foot' ? 0.9 : 2.6);
    }
    water.update(camera.position);
    roads.update(sky.night);
    scene.fog.density = 1.25 / Math.max(dd, 400) * (1 + sky.night * 0.5) * weather.fog * (0.6 + 0.4 * Math.max(sky.night, weather.dark));
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
      post.grade.uniforms.uWarm.value = sky.hour > 16.5 && sky.hour < 19.5 ? 0.05 * Math.sin((sky.hour - 16.5) / 3 * Math.PI) : 0;
      post.grade.uniforms.uNight.value = sky.night;
      // clear daylight gets the punchier, more saturated grade; storms and night stay muted
      const dayK = (1 - sky.night) * (1 - weather.dark * 0.8);
      post.grade.uniforms.uSat.value = 1.02 + dayK * 0.12;
      post.grade.uniforms.uContrast.value = 1.02 + dayK * 0.07;
      const aimingNow = S.mode === 'foot' && player.aiming && armed;
      post.update(sky.sunDir, sky.sunDir.y > 0.02 && weather.cover < 0.75, aimingNow ? 18 : camera.position.distanceTo(focus) + 1, aimingNow);
    }

    if (!S.skipRender) render(); // tests can step the simulation without drawing
    dynamicResolution(dt);
    hud.update(dt, {
      pos: mapPos, yaw: rig.yaw, heading: S.mode === 'car' ? S.vehicle.heading : player.heading,
      driving: S.mode === 'car', speed: S.vehicle?.speed || 0, hour: sky.hour, day: sky.day, prompt,
      police: [...police.cars.map((c) => c.v.pos), ...peds.list.filter((p) => p.role === 'cop' && p.mode !== 'dead').map((p) => p.pos)],
      hostiles: [...peds.list.filter((p) => p.role === 'foe' && p.mode !== 'dead').map((p) => p.pos), ...(game.hunting ? game.hunting.list.filter((x) => !x.dead && x.mode === 'charge').map((x) => x.pos) : [])],
      animals: game.hunting ? game.hunting.list.filter((x) => !x.dead && x.pos.distanceTo(focus) < 180).map((x) => ({ x: x.pos.x, z: x.pos.z, icon: { deer: '🦌', stag: '🦌', coyote: '🐺', fox: '🦊', horse: '🐎', cow: '🐄', bull: '🐂' }[x.sp] || '🐾' })) : [],
      myVehicles: S.mode === 'foot' ? parked.filter((v) => v === S.lastVehicle || v.uid).filter((v) => v.pos.distanceTo(focus) < 600).map((v) => ({ x: v.pos.x, z: v.pos.z, heading: v.heading })) : [],
      vehKind: S.vehicle ? (S.vehicle.isBoat ? 'boat' : S.vehicle.isAir ? (S.vehicle.heli ? 'heli' : 'plane') : 'car') : null, vehDmg: S.vehicle?.dmg,
      armed: combat.drawn,
      gunMode: S.mode === 'foot' && combat.drawn && S.dead <= 0,
      gunSil: S.mode === 'foot' && combat.drawn ? silhouette(combat.weapon, combat.model()?.userData.open || combat.models[combat.weapon] ? combat.model() : null) : '',
      dualSil: S.mode === 'foot' && combat.drawn && combat.dual,
      health: player.health, armor: player.armor, money: S.money, wanted: police.wanted, wantedLost: police.lost, blips: interact.blips(focus),
      weaponIcon: WEAPONS[combat.weapon].icon,
      ammo: combat.drawn ? (combat.reloading > 0 ? 'RELOADING' : combat.dual && combat.offhand && combat.offhand !== combat.weapon ? `${combat.ammo[combat.weapon].clip} · ${combat.ammo[combat.offhand].clip} / ${combat.ammo[combat.weapon].reserve}` : `${combat.ammo[combat.weapon].clip} / ${combat.ammo[combat.weapon].reserve}`) : '',
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
      if (S.indoors && game.estate) game.estate.leave(); // never carry the indoor state across a teleport
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
    weapon(w) { if (w !== 'fists') combat.give(w); combat.weapon = w; combat.holstered = w === 'fists'; combat.dual = false; },
    wheel: () => wheel, gunPose: () => gunPose,
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
    renderNow() { render(); },
    skipRender(b) { S.skipRender = !!b; },
    // Advance the game by exactly n fixed steps (used to capture smooth video on slow machines)
    step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) tick(dt); S.fps = 1 / dt; },
    toggleMap: () => hud.toggleMap(),
    showRegion: () => { hud.lastRegion = ''; hud.toastTimer = 0.001; },
    renderer, scene, camera, debug: { hm, graph, collision },
  };
  api.game = game;
  api.V3 = THREE.Vector3;
  api.THREE = THREE;
  api.catalogs = { LAND, BOATS, AIRCRAFT, WEAPONS, ATTACHMENTS };
  api.arsenalAct = (id) => arsenalUI.act(id, 'att');
  game.Vehicle = Vehicle;
  api.trace = (ox, oy, oz, dx, dy, dz, far = 200) => { const t = combat.trace(new THREE.Vector3(ox, oy, oz), new THREE.Vector3(dx, dy, dz).normalize(), far, { peds, vehicles: [...traffic.cars.map((c) => c.v), ...police.cars.map((c) => c.v), ...parked], animals: game.hunting ? game.hunting.list : [], statics: hitStatics }); return { kind: t.kind, t: +t.t.toFixed(3), head: !!t.head }; };
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
