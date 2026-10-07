// Entry point: renderer, input, pointer lock, HQ <-> raid flow, main loop.
import * as THREE from 'three';
import { AudioSys } from './audio.js';
import * as Save from './save.js';
import { HQ } from './hq.js';
import { HUD } from './hud.js';
import { Raid } from './raid.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const params = new URLSearchParams(location.search);
const testMode = params.has('test'); // no pointer lock needed (automation / debugging)

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const save = Save.load();
const audio = new AudioSys();
audio.setVolume(save.settings.volume);
const hud = new HUD(audio);
const input = { keys: {}, pressed: new Set(), mdx: 0, mdy: 0, lmb: false, rmb: false, wheel: 0 };

let raid = null;
let kit = null;

const locked = () => testMode || document.pointerLockElement === canvas;

function lock() {
  if (testMode) return;
  try {
    const p = canvas.requestPointerLock();
    if (p && p.catch) p.catch(() => {});
  } catch (e) { /* not available */ }
  setTimeout(() => { if (raid && !raid.ui && !raid.over && !locked()) setPaused(true); }, 400);
}
function unlock() { if (document.pointerLockElement) document.exitPointerLock(); }

function setPaused(p) {
  if (!raid) return;
  raid.paused = p;
  $('pause').classList.toggle('hidden', !p);
  if (p) {
    $('sens').value = save.settings.sens;
    $('vol').value = save.settings.volume;
  }
}

const hq = new HQ($('hq'), save, { deploy, audio });

function deploy() {
  audio.init();
  kit = Save.prepareKit(save);
  Save.store(save);
  hq.hide();
  $('loading').classList.remove('hidden');
  // let the loading screen paint before the (synchronous) world build
  setTimeout(() => {
    raid = new Raid({ renderer, audio, hud, input, kit, settings: save.settings, lock, unlock, onEnd });
    window.__raid = raid;
    $('loading').classList.add('hidden');
    hud.show();
    raid.update(0);
    lock();
  }, 50);
}

function onEnd(result) {
  Save.applyResult(save, kit, result);
  raid.dispose();
  raid = null;
  window.__raid = null;
  hud.hide();
  setPaused(false);
  $('pause').classList.add('hidden');
  unlock();
  hq.show(result);
}

// ---------------------------------------------------------------- input
document.addEventListener('pointerlockchange', () => {
  if (!raid || raid.over) return;
  if (locked()) setPaused(false);
  else if (!raid.ui) setPaused(true);
});

canvas.addEventListener('click', () => {
  audio.init();
  if (raid && !raid.ui && !raid.over && !locked()) lock();
});

addEventListener('keydown', (e) => {
  if (!raid) return;
  if (['Tab', 'Space', 'KeyM'].includes(e.code) || e.ctrlKey) e.preventDefault();
  if (raid.paused) return;
  input.keys[e.code] = true;
  if (!e.repeat) {
    input.pressed.add(e.code);
    raid.onKey(e.code);
  }
});
addEventListener('keyup', (e) => { input.keys[e.code] = false; });
addEventListener('blur', () => { input.keys = {}; input.lmb = input.rmb = false; });

addEventListener('mousemove', (e) => {
  if (!raid || !locked() || raid.ui) return;
  input.mdx += e.movementX || 0;
  input.mdy += e.movementY || 0;
});
addEventListener('mousedown', (e) => {
  if (!raid || !locked() || raid.ui || raid.paused) return;
  if (e.button === 0) input.lmb = true;
  if (e.button === 2) input.rmb = true;
});
addEventListener('mouseup', (e) => {
  if (e.button === 0) input.lmb = false;
  if (e.button === 2) input.rmb = false;
});
addEventListener('wheel', (e) => { if (raid && locked() && !raid.ui) input.wheel = Math.sign(e.deltaY); }, { passive: true });
addEventListener('contextmenu', (e) => e.preventDefault());

$('resume').addEventListener('click', () => { audio.init(); if (testMode) setPaused(false); else lock(); });
$('abandon').addEventListener('click', () => {
  if (!raid || !confirm('Abandon the raid? You will lose everything you brought.')) return;
  setPaused(false);
  raid.player.alive = false;
  raid.endRaid(false, 'Abandoned the raid');
});
$('sens').addEventListener('input', (e) => { save.settings.sens = +e.target.value; Save.store(save); });
$('vol').addEventListener('input', (e) => { save.settings.volume = +e.target.value; audio.setVolume(save.settings.volume); Save.store(save); });

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  if (raid) raid.resize(innerWidth, innerHeight);
});

// ---------------------------------------------------------------- loop
let last = performance.now();
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (raid) {
    raid.update(dt);
    if (raid) raid.render();
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

hq.show();
