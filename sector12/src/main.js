// Entry point: renderer, input, pointer lock, title <-> game flow, main loop.
import * as THREE from 'three';
import { AudioSys } from './audio.js';
import * as Save from './save.js';
import { HUD, esc } from './ui/hud.js';
import { Game } from './game.js';
import { ITEMS, fmtDuration } from './data/catalog.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const params = new URLSearchParams(location.search);
const testMode = params.has('test');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.0;
renderer.localClippingEnabled = true; // the POB reveals prints layer by layer

let save = Save.load();
if (params.has('fastprint')) save.speed = 0.02; // debug: prints finish ~50x faster
else delete save.speed;
const audio = new AudioSys();
audio.setVolume(save.settings.volume);
const hud = new HUD(audio);
const input = { keys: {}, pressed: new Set(), mdx: 0, mdy: 0, lmb: false, rmb: false, wheel: 0 };
let game = null;

const locked = () => testMode || document.pointerLockElement === canvas;
function lock() {
  if (testMode) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* unsupported */ }
  setTimeout(() => { if (game && !game.ui && !game.over && !locked()) setPaused(true); }, 400);
}
function unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
function setPaused(p) {
  if (!game) return;
  game.paused = p;
  $('pause').classList.toggle('hidden', !p);
  if (p) { $('sens').value = save.settings.sens; $('vol').value = save.settings.volume; }
}
const persist = () => Save.store(save);

// ---------------------------------------------------------------- title
function showTitle(result = null) {
  const s = save;
  const q = s.queue.length ? `${s.queue.length} printing · next done in ${fmtDuration((s.queue[0].end - Date.now()) / 1000)}` : 'printer idle';
  let res = '';
  if (result) {
    res = result.success
      ? `<div class="result ok"><h2>EXTRACTED</h2><p>${fmtDuration(result.time)} on the island · ${result.kills} kills · +${result.filament} filament banked</p>
         ${result.items.length ? `<p class="small">Secured to locker: ${result.items.map(esc).join(', ')}</p>` : ''}</div>`
      : `<div class="result bad"><h2>YOU DIED</h2><p>${esc(result.cause)} · ${fmtDuration(result.time)} on the island · ${result.kills} kills</p>
         ${result.lost.length ? `<p class="small">Lost: ${result.lost.map(esc).join(', ')}</p>` : ''}</div>`;
  }
  $('title').innerHTML = `<div class="tbox">
    <h1>SECTOR 12</h1><p class="tag">An island in the middle of nowhere. Print to survive.</p>
    ${res}
    <div class="tstats"><span>◆ <b>${s.bank}</b> filament banked</span><span>🧵 <b>${s.cloth || 0}</b> cloth</span><span>🗄 <b>${s.locker.length}</b> in locker</span><span>🖨 ${q}</span></div>
    <button class="deploy" id="deploy">${result ? 'RESPAWN AT THE POB' : 'DEPLOY'}</button>
    <div class="cols">
      <div><h4>Controls</h4><ul>
        <li><kbd>WASD</kbd> move · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump/climb · <kbd>C</kbd> crouch</li>
        <li><kbd>LMB</kbd> fire / swing / throw · <kbd>RMB</kbd> aim (CO2 knife: fire blade)</li>
        <li><kbd>R</kbd> reload · <kbd>T</kbd> switch ammo type · <kbd>V</kbd> pump Patriot 09</li>
        <li><kbd>1</kbd>–<kbd>5</kbd> guns / melee / throwing / flare · <kbd>Q</kbd> cycle</li>
        <li><kbd>F</kbd> quick-heal · <kbd>H</kbd> hand warmer · <kbd>Z</kbd> pin target</li>
        <li><kbd>E</kbd> interact · <kbd>Tab</kbd> inventory · <kbd>M</kbd> map · <kbd>Esc</kbd> pause</li></ul></div>
      <div><h4>Survive Sector 12</h4><ul>
        <li>You spawn at the <b>POB</b>. Deposit filament in its crate, then print gear on the touchscreen.</li>
        <li>Filament: headshot kill <b>10</b> · body kill <b>5</b> · explosive or mid-air kill <b>30</b>. Cargo helis drop caches.</li>
        <li><b>South</b> forest: water, cover, hunting. <b>West</b> desert: scorching — wear sand gear. <b>East</b> jungle: rivers and ruins. <b>North</b> mountain: freezing, best loot.</li>
        <li><b>Extract</b> at the very top of Frostfang Summit to bank everything you carry. Die and you lose it.</li></ul></div>
    </div>
    <button class="danger" id="reset">Reset progress</button>
  </div>`;
  $('title').classList.remove('hidden');
  $('deploy').onclick = deploy;
  $('reset').onclick = () => { if (confirm('Erase all progress (bank, locker, prints)?')) { save = Save.reset(); showTitle(); } };
}

async function deploy() {
  audio.init();
  $('title').classList.add('hidden');
  $('loading').classList.remove('hidden');
  $('loading-detail').textContent = 'Building the island…';
  await new Promise((r) => setTimeout(r, 30));
  game = new Game({ renderer, audio, hud, input, save, persist, lock, unlock, onExit });
  window.__game = game;
  await game.load((ready, want) => { $('loading-detail').textContent = `Streaming terrain ${ready}/${want}`; });
  $('loading').classList.add('hidden');
  hud.show();
  lock();
}

function onExit(result) {
  game.dispose();
  game = null;
  window.__game = null;
  hud.hide();
  setPaused(false);
  $('pause').classList.add('hidden');
  unlock();
  showTitle(result);
}

// ---------------------------------------------------------------- input
document.addEventListener('pointerlockchange', () => {
  if (!game || game.over) return;
  if (locked()) setPaused(false); else if (!game.ui) setPaused(true);
});
canvas.addEventListener('click', () => { audio.init(); if (game && !game.ui && !game.over && !locked()) lock(); });
addEventListener('keydown', (e) => {
  if (!game) return;
  const typing = e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT');
  if (typing && e.code !== 'Escape') return;
  if (['Tab', 'Space', 'KeyM'].includes(e.code) || e.ctrlKey) e.preventDefault();
  if (game.paused) return;
  input.keys[e.code] = true;
  if (!e.repeat) { input.pressed.add(e.code); game.onKey(e.code); }
});
addEventListener('keyup', (e) => { input.keys[e.code] = false; });
addEventListener('blur', () => { input.keys = {}; input.lmb = input.rmb = false; });
addEventListener('mousemove', (e) => { if (game && locked() && !game.ui) { input.mdx += e.movementX || 0; input.mdy += e.movementY || 0; } });
addEventListener('mousedown', (e) => {
  if (!game || !locked() || game.ui || game.paused) return;
  if (e.button === 0) input.lmb = true;
  if (e.button === 2) input.rmb = true;
});
addEventListener('mouseup', (e) => { if (e.button === 0) input.lmb = false; if (e.button === 2) input.rmb = false; });
addEventListener('wheel', (e) => { if (game && locked() && !game.ui) input.wheel = Math.sign(e.deltaY); }, { passive: true });
addEventListener('contextmenu', (e) => e.preventDefault());

$('resume').addEventListener('click', () => { audio.init(); if (testMode) setPaused(false); else lock(); });
$('quit').addEventListener('click', () => {
  if (!game) return;
  const safe = game.inSafeZone(game.player.pos);
  if (!safe && !confirm('You are outside the POB safe zone. Quitting now loses everything you carry. Quit anyway?')) return;
  if (safe) game.saveCarry(); else { save.carry = []; persist(); }
  setPaused(false);
  const g = game;
  g.dispose(); game = null; window.__game = null;
  hud.hide(); $('pause').classList.add('hidden'); unlock();
  showTitle();
});
$('sens').addEventListener('input', (e) => { save.settings.sens = +e.target.value; persist(); });
$('vol').addEventListener('input', (e) => { save.settings.volume = +e.target.value; audio.setVolume(save.settings.volume); persist(); });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight); if (game) game.resize(innerWidth, innerHeight); });

// ---------------------------------------------------------------- loop
let last = performance.now(), termT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (game) {
    game.update(dt);
    if (game) {
      game.render();
      termT -= dt;
      if (game.ui === 'terminal' && hud.term.tab === 'queue' && termT <= 0) { termT = 0.5; hud.renderPanel(game); }
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
showTitle();
