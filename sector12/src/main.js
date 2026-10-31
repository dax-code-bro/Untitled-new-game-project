// Entry point: renderer, input, pointer lock, title <-> game flow, main loop.
import * as THREE from 'three';
import { AudioSys } from './audio.js';
import * as Save from './save.js';
import { HUD, esc } from './ui/hud.js';
import { Game } from './game.js';
import { buildTextures, arrayTextures } from './textures.js';
import { QUALITY } from './graphics.js';
import { TouchControls, isTouchDevice } from './touch.js';
import { ITEMS, fmtDuration } from './data/catalog.js';

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const params = new URLSearchParams(location.search);
const testMode = params.has('test');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
renderer.setSize(innerWidth, innerHeight);
renderer.localClippingEnabled = true; // the POB reveals prints layer by layer
// (shadows, tone mapping, pixel ratio and post-processing are set up per quality preset in graphics.js)

let save = Save.load();
if (params.has('fastprint')) save.speed = 0.02; // debug: prints finish ~50x faster
else delete save.speed;
const audio = new AudioSys();
audio.setVolume(save.settings.volume);
const hud = new HUD(audio);
const input = { keys: {}, pressed: new Set(), mdx: 0, mdy: 0, lmb: false, rmb: false, wheel: 0, stick: null };
const touchMode = isTouchDevice();
// phones get the light preset by default (it can be raised in the pause menu)
if (touchMode && !save.settings.quality) save.settings.quality = 'low';
let game = null;
const touch = touchMode ? new TouchControls({ input, getGame: () => game, pause: () => setPaused(true), audio }) : null;
let textures = null; // generated once, reused across lives
if (!save.settings.quality) save.settings.quality = params.get('quality') || 'high';
if (params.get('quality')) save.settings.quality = params.get('quality');

const locked = () => testMode || touchMode || document.pointerLockElement === canvas;
function lock() {
  if (testMode || touchMode) return;
  try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* unsupported */ }
  setTimeout(() => { if (game && !game.ui && !game.over && !locked()) setPaused(true); }, 400);
}
function unlock() { if (document.pointerLockElement) document.exitPointerLock(); }
function setPaused(p) {
  if (!game) return;
  game.paused = p;
  $('pause').classList.toggle('hidden', !p);
  if (touch) touch.show(!p && !!game && !game.over);
  if (p) { $('sens').value = save.settings.sens; $('vol').value = save.settings.volume; $('quality').value = save.settings.quality || 'high'; showViewDist(); }
}
const persist = () => Save.store(save);
// render distance defaults to what the graphics preset can carry
const VIEW_DEFAULT = { low: 900, medium: 1500, high: 2500, ultra: 4000 };
const viewDist = () => save.settings.viewDist || VIEW_DEFAULT[save.settings.quality || 'high'] || 2500;
const showViewDist = () => { $('viewdist').value = viewDist(); $('vdval').textContent = `${(viewDist() / 1000).toFixed(1)} km`; };

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
    ${saveFilesHtml()}
    <div class="tstats"><span>◆ <b>${s.bank}</b> filament banked</span><span>🧵 <b>${s.cloth || 0}</b> cloth</span><span>🗄 <b>${s.locker.length}</b> in locker</span><span>🖨 ${q}</span></div>
    <button class="deploy" id="deploy">${result ? 'RESPAWN AT THE POB' : 'DEPLOY'} · ${esc(Save.activeName())}</button>
    <div class="cols">
      ${touchMode ? `<div><h4>Touch controls</h4><ul>
        <li>Left thumb: move (push to the edge to sprint) · Right thumb: drag to look</li>
        <li><b>FIRE</b> (keep dragging to aim while firing) · <b>AIM</b> toggles sights · <b>JUMP</b> · <b>CROUCH</b> · <b>RELOAD</b></li>
        <li><b>USE</b> appears near things you can open, loot or harvest</li>
        <li>Top bar: <b>SWAP</b> weapon · <b>HEAL</b> · <b>AMMO</b> type · <b>BAG</b> inventory · <b>MAP</b> · <b>II</b> pause</li></ul></div>` : `<div><h4>Controls</h4><ul>
        <li><kbd>WASD</kbd> move · <kbd>Shift</kbd> sprint · <kbd>Space</kbd> jump/climb · <kbd>C</kbd> crouch</li>
        <li><kbd>LMB</kbd> fire / swing / throw · <kbd>RMB</kbd> aim (CO2 knife: fire blade)</li>
        <li><kbd>R</kbd> reload · <kbd>T</kbd> switch ammo type · <kbd>V</kbd> pump Patriot 09</li>
        <li><kbd>1</kbd>–<kbd>5</kbd> guns / melee / throwing / flare · <kbd>Q</kbd> cycle</li>
        <li><kbd>F</kbd> quick-heal · <kbd>H</kbd> hand warmer · <kbd>Z</kbd> pin target</li>
        <li><kbd>E</kbd> interact · <kbd>Tab</kbd> inventory · <kbd>M</kbd> map · <kbd>Esc</kbd> pause</li></ul></div>`}
      <div><h4>Survive Sector 12</h4><ul>
        <li>You spawn at the <b>POB</b>. Deposit filament in its crate, then print gear on the touchscreen.</li>
        <li>Filament: headshot kill <b>10</b> · body kill <b>5</b> · explosive or mid-air kill <b>30</b>. Cargo helis drop caches.</li>
        <li><b>South</b> forest: water, cover, hunting. <b>West</b> desert: scorching — wear sand gear. <b>East</b> jungle: rivers and ruins. <b>North</b> mountain: freezing, best loot.</li>
        <li><b>Extract</b> at the very top of Frostfang Summit to bank everything you carry. Die and you lose it.</li></ul></div>
    </div>
    <button class="danger" id="reset">Reset “${esc(Save.activeName())}”</button>
  </div>`;
  $('title').classList.remove('hidden');
  $('deploy').onclick = deploy;
  // two-step buttons instead of browser pop-ups (the web page blocks those)
  armTwoStep($('reset'), 'Tap again to erase this save', () => { save = Save.reset(); applySettings(); showTitle(); });
  bindSaveFiles();
}

// ---------------------------------------------------------------- save files
const ago = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
function saveFilesHtml() {
  const list = Save.listSlots();
  const rows = list.map((m) => `<div class="slot ${m.active ? 'on' : ''}" data-id="${m.id}">
      <div class="sname"><b>${esc(m.name)}</b>${m.active ? '<em>playing</em>' : ''}<small>${ago(m.played)}</small></div>
      <div class="sstats">◆ ${m.bank} · 🗄 ${m.locker}${m.queue ? ` · 🖨 ${m.queue}` : ''} · ${m.kills} kills · ${m.extracts} extracts</div>
      <div class="sbtns">${m.active ? '' : `<button data-sact="play">Play</button>`}<button data-sact="rename">Rename</button><button data-sact="del" class="danger">Delete</button></div>
    </div>`).join('');
  return `<div class="saves"><h4>Save files</h4>${rows}
    ${list.length < Save.MAX_SLOTS ? `<form id="newsave" class="newsave"><input id="newname" maxlength="24" placeholder="Name your new game" autocomplete="off"><button type="submit">+ New game</button></form>` : `<p class="small">You have ${Save.MAX_SLOTS} save files; delete one to start another.</p>`}</div>`;
}
function applySettings() { audio.setVolume(save.settings.volume); }
function armTwoStep(btn, armedText, fn) {
  if (!btn) return;
  const label = btn.textContent;
  let armed = false, t = null;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    if (!armed) { armed = true; btn.textContent = armedText; btn.classList.add('armed'); t = setTimeout(() => { armed = false; btn.textContent = label; btn.classList.remove('armed'); }, 3500); return; }
    clearTimeout(t);
    fn();
  });
}
function bindSaveFiles() {
  const form = $('newsave');
  if (form) form.addEventListener('submit', (e) => { e.preventDefault(); const s2 = Save.createSlot($('newname').value); if (s2) { save = s2; applySettings(); showTitle(); } });
  document.querySelectorAll('#title .slot').forEach((row) => {
    const id = row.dataset.id;
    const b = (k) => row.querySelector(`[data-sact="${k}"]`);
    if (b('play')) b('play').onclick = () => { save = Save.load(id); applySettings(); showTitle(); };
    b('rename').onclick = () => {
      const nm = row.querySelector('.sname b');
      const input = document.createElement('input');
      input.maxLength = 24; input.value = nm.textContent; input.className = 'rename';
      nm.replaceWith(input); input.focus(); input.select();
      let finished = false;
      const done = (keep = true) => { if (finished) return; finished = true; if (keep) Save.renameSlot(id, input.value); setTimeout(() => showTitle(), 0); };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') done(); if (e.key === 'Escape') done(false); });
      input.addEventListener('blur', done);
    };
    armTwoStep(b('del'), 'Tap again', () => { const s2 = Save.deleteSlot(id); if (s2) save = s2; applySettings(); showTitle(); });
  });
}

async function deploy() {
  audio.init();
  if (touchMode) {
    // full screen, landscape, where the browser allows it
    try { const r = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen({ navigationUI: 'hide' }); if (r && r.then) r.then(() => screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {})).catch(() => {}); } catch (e) { /* not allowed here */ }
  }
  $('title').classList.add('hidden');
  $('loading').classList.remove('hidden');
  $('loading-detail').textContent = 'Building the island…';
  await new Promise((r) => setTimeout(r, 30));
  const q = QUALITY[save.settings.quality || 'high'] || QUALITY.high;
  if (!textures || textures.size !== q.texSize) {
    textures = buildTextures(q.texSize, (i, n, name) => { $('loading-detail').textContent = `Generating materials ${i}/${n} (${name})`; });
    textures.size = q.texSize;
    textures.terrain = arrayTextures(textures, ['grass', 'forest', 'jungle', 'sand', 'rock', 'snow', 'dirt']);
    await new Promise((r) => setTimeout(r, 10));
  }
  game = new Game({ renderer, audio, hud, input, save, persist, lock, unlock, onExit, textures });
  window.__game = game;
  game.setViewDistance(viewDist());
  await game.load((ready, want) => { $('loading-detail').textContent = `Streaming terrain ${ready}/${want}`; });
  $('loading').classList.add('hidden');
  hud.show();
  if (touch) touch.show(true);
  lock();
}

function onExit(result) {
  game.dispose();
  game = null;
  window.__game = null;
  hud.hide();
  setPaused(false);
  $('pause').classList.add('hidden');
  if (touch) touch.show(false);
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

$('resume').addEventListener('click', () => { audio.init(); if (testMode || touchMode) setPaused(false); else lock(); });
let quitArmed = 0;
$('quit').addEventListener('click', () => {
  if (!game) return;
  const safe = game.inSafeZone(game.player.pos);
  if (!safe && Date.now() - quitArmed > 4000) { quitArmed = Date.now(); $('quit').textContent = 'Outside the safe zone: you lose what you carry. Tap again to quit'; setTimeout(() => { $('quit').textContent = 'Quit to title'; }, 4000); return; }
  quitArmed = 0; $('quit').textContent = 'Quit to title';
  if (safe) game.saveCarry(); else { save.carry = []; persist(); }
  setPaused(false);
  const g = game;
  g.dispose(); game = null; window.__game = null;
  hud.hide(); $('pause').classList.add('hidden'); if (touch) touch.show(false); unlock();
  showTitle();
});
$('sens').addEventListener('input', (e) => { save.settings.sens = +e.target.value; persist(); });
$('quality').addEventListener('change', (e) => { save.settings.quality = e.target.value; persist(); showViewDist(); });
$('viewdist').addEventListener('input', (e) => { save.settings.viewDist = +e.target.value; persist(); showViewDist(); if (game) game.setViewDistance(viewDist()); });
$('vol').addEventListener('input', (e) => { save.settings.volume = +e.target.value; audio.setVolume(save.settings.volume); persist(); });
addEventListener('resize', () => { if (game) game.resize(innerWidth, innerHeight); else renderer.setSize(innerWidth, innerHeight); });

// ---------------------------------------------------------------- loop
let last = performance.now(), termT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (window.__freeze) { requestAnimationFrame(frame); return; } // automation renders frames by hand
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
