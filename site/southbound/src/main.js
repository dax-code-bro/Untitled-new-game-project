// SOUTHBOUND — boot, world build, game loop.
import * as THREE from 'three';
import { loadSettings, saveSettings, resolveQuality, PRESETS } from './settings.js';
import { setupMenu, setupSettingsPanel } from './ui/menu.js';
import { buildRoadGraph, CITY, TOWN, regionAt } from './world/layout.js';
import { Heightmap } from './world/heightmap.js';
import { createTerrain, makeWorldTextures, worldUniforms } from './world/terrain.js';
import { createSky } from './world/sky.js';
import { createWater } from './world/water.js';
import { createRoads } from './world/roads.js';
import { createBuildings } from './world/buildings.js';
import { createVegetation, grassUniforms } from './world/vegetation.js';
import { CollisionWorld } from './world/collision.js';
import { Player } from './entities/player.js';
import { Vehicle } from './entities/vehicle.js';
import { Traffic } from './entities/traffic.js';
import { Input } from './core/input.js';
import { CameraRig } from './core/camera.js';
import { createPost } from './core/post.js';
import { GameAudio } from './core/audio.js';
import { HUD } from './ui/hud.js';
import { nextFrame, clamp } from './util.js';

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
  const q = resolveQuality(settings);
  const canvas = $('#game');
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: q.aa === 'msaa', powerPreference: 'high-performance', stencil: false });
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = q.shadows > 0;
  renderer.shadowMap.type = q.shadows >= 3 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(settings.fov, innerWidth / innerHeight, 0.3, 12000);

  // ---- world
  progress(0.02, 'Surveying Calvera');
  await nextFrame();
  const hm = new Heightmap();
  const graph = buildRoadGraph();
  await hm.generate(progress);
  hm.shapeRoads(graph);
  progress(0.6, 'Paving roads and highways');
  await nextFrame();
  hm.buildSplat();
  const tex = makeWorldTextures(hm);
  worldUniforms.uHeightTex.value = tex.heightTex;
  worldUniforms.uSplatTex.value = tex.splatTex;
  const collision = new CollisionWorld(hm);
  progress(0.66, 'Shaping the terrain');
  await nextFrame();
  const terrain = createTerrain(hm, q, scene);
  const water = createWater(scene);
  const roads = createRoads(graph, hm, q, scene, collision);
  progress(0.74, 'Building Port Calvera and Mill Creek');
  await nextFrame();
  const city = createBuildings(hm, q, scene, collision);
  progress(0.84, 'Growing Pinewood Hollow');
  await nextFrame();
  const veg = createVegetation(hm, q, scene, collision, city.cityBlocks);
  addSidewalkColliders(collision);
  progress(0.92, 'Lighting the sky');
  await nextFrame();
  const sky = createSky(renderer, scene, q);

  // ---- actors
  const player = new Player(scene);
  const spawn = { x: CITY.x0 - 26, z: CITY.z0 + 3 * CITY.pitch + 3 };
  player.pos.set(spawn.x, collision.surface(spawn.x, spawn.z, 50), spawn.z);
  player.heading = Math.PI / 2;
  const parked = [];
  const myCar = new Vehicle('sports', 0xc2410f, q);
  myCar.pos.set(CITY.x0 - 14, CITY.height + 0.1, spawn.z - 6);
  myCar.heading = Math.PI / 2;
  myCar.sync(0);
  scene.add(myCar.group);
  parked.push(myCar);
  const traffic = new Traffic(graph, q, scene);
  const basePreset = PRESETS[settings.preset] || PRESETS.high;

  const input = new Input(canvas, $('#touch'), settings);
  const rig = new CameraRig(camera, settings);
  rig.yaw = player.heading;
  const audio = new GameAudio(settings);
  audio.start();
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
    if (post) { post.composer.setPixelRatio(pr); post.setSize(innerWidth, innerHeight); }
  };
  applySize();
  post = createPost(renderer, scene, camera, q);
  applySize();
  addEventListener('resize', applySize);

  // warm up shaders so the first frames don't hitch
  progress(0.97, 'Compiling shaders');
  await nextFrame();
  sky.update(0, 0, player.pos);
  renderer.compile(scene, camera);

  $('#loading').classList.remove('show');
  $('#hud').classList.add('show');
  if (settings.isTouch || settings.platform === 'phone') $('#touch').classList.add('show');

  // ---- state
  const S = {
    mode: 'foot', vehicle: null, paused: false, override: null,
    fps: 60, frameMs: 16, frames: 0, fpsTimer: 0, lowTimer: 0, highTimer: 0, resTimer: 0,
  };
  const stats = { drawCalls: 0, tris: 0 };

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

  hud.toast('Welcome to Calvera. Walk to the orange car and press F (or tap 🚗) to drive.', 6);

  const tmpV = new THREE.Vector3();
  const focus = new THREE.Vector3();
  let last = performance.now();

  function enterVehicle(v, fromTraffic) {
    if (fromTraffic) {
      const sp = fromTraffic.speed;
      traffic.release(fromTraffic);
      v.vel.set(Math.sin(v.heading) * sp, Math.cos(v.heading) * sp);
    } else parked.splice(parked.indexOf(v), 1);
    S.mode = 'car'; S.vehicle = v;
    player.char.root.visible = false;
    hud.toast(`${v.spec.name}`, 2.5);
  }
  function exitVehicle() {
    const v = S.vehicle;
    const sx = Math.cos(v.heading), sz = -Math.sin(v.heading);
    const x = v.pos.x + sx * (v.spec.width / 2 + 0.9), z = v.pos.z + sz * (v.spec.width / 2 + 0.9);
    player.pos.set(x, collision.surface(x, z, v.pos.y + 1), z);
    player.vel.set(0, 0, 0);
    player.heading = v.heading;
    player.char.root.visible = true;
    v.vel.set(0, 0); v.speed = 0;
    parked.push(v);
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
    dt = Math.min(dt, 0.05);

    const a = input.poll();
    if (S.override) Object.assign(a, S.override);
    if (a.pause) setPaused(!S.paused);
    if (a.map) hud.toggleMap();
    if (S.paused) { render(); return; }
    audio.resume();
    worldUniforms.uTime.value += dt;

    let prompt = '';
    if (S.mode === 'foot') {
      player.update(dt, a, rig.yaw, hm, collision);
      // nearby car?
      let best = null, bd = 4.2, fromTraffic = null;
      for (const v of parked) { const d = v.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = v; } }
      const tc = traffic.nearest(player.pos, bd);
      if (tc) { best = tc.v; fromTraffic = tc; }
      if (best) {
        prompt = settings.isTouch ? `Tap 🚗 to drive the ${best.spec.name}` : `Press F to drive the ${best.spec.name}`;
        if (a.enter) enterVehicle(best, fromTraffic);
      }
      focus.copy(player.pos);
    } else {
      const v = S.vehicle;
      v.physics(dt, { throttle: a.throttle, brake: a.brake, steer: -a.moveX, handbrake: a.handbrake }, hm, collision);
      for (const p of parked) {
        const dx = p.pos.x - v.pos.x, dz = p.pos.z - v.pos.z, d = Math.hypot(dx, dz);
        if (d < 3.2 && d > 1e-3) { v.pos.x -= (dx / d) * (3.2 - d); v.pos.z -= (dz / d) * (3.2 - d); v.vel.multiplyScalar(0.7); v.impact = Math.max(v.impact, 3); }
      }
      v.night = sky.night;
      v.sync(dt);
      if (v.impact > 4) rig.shake = Math.min(1, v.impact / 15);
      if (a.enter && Math.abs(v.speed) < 6) exitVehicle();
      else if (a.enter) prompt = 'Slow down to get out';
      if (v.drowned) prompt = 'The engine is flooded — press F to get out';
      focus.copy(v.pos);
    }
    for (const p of parked) { p.night = sky.night; p.sync(dt); }

    traffic.max = Math.round(basePreset.traffic * settings.trafficDensity);
    traffic.update(dt, focus, S.vehicle, S.mode === 'foot' ? player.pos : null, sky.night);
    sky.update(dt, settings.timeScale, focus);
    rig.update(dt, a, focus, { vehicle: S.vehicle, heading: S.vehicle?.heading, speed: S.vehicle?.speed || 0, lastLook: input.lastLookTime }, collision);

    const dd = basePreset.drawDistance * settings.drawDistance;
    terrain.update(camera.position, dd);
    veg.update(camera.position, dd);
    water.update(camera.position);
    roads.update(sky.night);
    scene.fog.density = 1.6 / Math.max(dd, 400) * (1 + sky.night * 0.6);
    grassUniforms.uSunDir.value.copy(sky.sunDir);
    grassUniforms.uSunColor.value.copy(sky.sun.color).multiplyScalar(sky.sun.intensity * 0.35);
    grassUniforms.uAmbient.value.copy(sky.hemi.color).multiplyScalar(sky.hemi.intensity * 0.6);
    grassUniforms.uFogColor.value.copy(scene.fog.color);
    grassUniforms.uFogDensity.value = scene.fog.density;

    // headlight
    if (S.vehicle && sky.night > 0.3) {
      const v = S.vehicle, fx = Math.sin(v.heading), fz = Math.cos(v.heading);
      headlight.intensity = 60 * sky.night;
      headlight.position.set(v.pos.x + fx * 2.4, v.pos.y + 0.9, v.pos.z + fz * 2.4);
      headlight.target.position.set(v.pos.x + fx * 25, v.pos.y - 1, v.pos.z + fz * 25);
    } else headlight.intensity = 0;

    const reg = regionAt(focus.x, focus.z);
    audio.update(dt, {
      driving: S.mode === 'car', speed: S.vehicle?.speed || 0, throttle: a.throttle, night: sky.night,
      horn: a.horn && S.mode === 'car', impact: S.vehicle?.impact || 0, nature: reg.name !== 'Port Calvera',
    });
    if (post) post.grade.uniforms.uWarm.value = 0.015 + (sky.hour > 16 && sky.hour < 20 ? 0.02 : 0);

    render();
    dynamicResolution(dt);
    hud.update(dt, {
      pos: focus, yaw: rig.yaw, heading: S.mode === 'car' ? S.vehicle.heading : player.heading,
      driving: S.mode === 'car', speed: S.vehicle?.speed || 0, hour: sky.hour, day: sky.day, prompt,
      traffic: traffic.cars.map((c) => c.v.pos),
      fpsText: `${Math.round(S.fps)} FPS · ${q.label} · ${renderer.domElement.width}×${renderer.domElement.height}\n${stats.drawCalls} draws · ${(stats.tris / 1e6).toFixed(2)}M tris`,
    });
  }

  function render() {
    if (post) post.render(); else renderer.render(scene, camera);
    stats.drawCalls = renderer.info.render.calls;
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
    setOverride(o) { S.override = o; },
    teleport(x, z, heading = 0) {
      const y = collision.surface(x, z, 500);
      if (S.mode === 'car') { S.vehicle.pos.set(x, y, z); S.vehicle.heading = heading; S.vehicle.vel.set(0, 0); }
      else { player.pos.set(x, y, z); player.heading = heading; }
      rig.yaw = heading;
    },
    lookAt(yaw, pitch) { rig.yaw = yaw; rig.pitch = pitch; },
    enterNearest() {
      let best = null, bd = 30;
      for (const v of parked) { const d = v.pos.distanceTo(player.pos); if (d < bd) { bd = d; best = v; } }
      if (best) enterVehicle(best, null);
    },
    spawnCar(type = 'sports', color = 0xc2410f) {
      const v = new Vehicle(type, color, q);
      v.pos.copy(player.pos); v.heading = player.heading; scene.add(v.group); parked.push(v); return true;
    },
    pause: setPaused,
    freeze(f) { S.frozen = f; },
    toggleMap: () => hud.toggleMap(),
    showRegion: () => { hud.lastRegion = ''; },
    renderer, scene, camera,
  };
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
