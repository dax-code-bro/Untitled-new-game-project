/* Bunker Nine — the front end.
 *
 * Everything you see before the game and everything you see over the top
 * of it: the loading screen, the main menu, the settings, and the pause
 * screen. It is a separate file from the game on purpose. bunker-nine.js
 * is twelve thousand lines about a bunker; this is about a menu, and the
 * two want different things from a reader.
 *
 * It owns the boot sequence. The page no longer calls BUNKER.start()
 * itself -- SHELL.boot() does, in order, with the bar moving for each
 * real step, and the game only appears when it is genuinely ready.
 *
 * Nothing here talks to the game except through BUNKER: the returned
 * { game, S, P } handle, and the settings object it reads on start.
 */
(function () {
'use strict';

var SHELL = {};
var W = window;

/* ================================================================
   SETTINGS: the model
   ================================================================
   One flat object, versioned, in localStorage. Flat because every
   consumer wants one value and a nested shape only makes the read sites
   longer; versioned because a save that outlives a change to this list
   has to survive it -- unknown keys are dropped, missing keys take the
   default, so an old save from before a setting existed still loads. */

var SETTINGS_KEY = 'b9.settings.v1';

var DEFAULTS = {
  /* --- services --- */
  online: true,               // log in to online services during load

  /* --- input --- */
  sensitivity: 1.00,          // mouse, multiplier on the game's base
  padSensitivity: 1.00,       // right stick, separate because it is a different device
  adsMultiplier: 0.65,        // how much of it you keep while aiming
  invertY: false,
  deadzoneLeft: 0.16,
  deadzoneRight: 0.14,
  triggerThreshold: 0.35,
  vibration: true,
  vibrationStrength: 1.00,
  padLayout: 'standard',      // standard | southpaw | legacy | custom
  padBinds: null,             // custom layout: { action: buttonIndex }
  keyBinds: null,             // custom keyboard: { action: 'KeyW' }

  /* --- microphone --- */
  micEnabled: false,
  micGain: 1.00,
  micGate: 0.06,              // below this the meter reads silence
  micDevice: '',              // deviceId, '' = system default

  /* --- graphics --- */
  graphics: 'normal',         // low | normal | high | ultra | custom
  gShadows: true,
  gParticles: 1.00,
  gBloom: true,
  gGrain: true,
  gVignette: true,
  gRenderScale: 1.00,
  gViewDistance: 220,

  /* --- frame limits --- */
  fpsMenu: 60,                // the lobby and every menu outside a round
  fpsGame: 0,                 // 0 = uncapped, take the display
  fpsPaused: 30,              // paused, still rendering behind the panel

  /* --- audio --- */
  volMaster: 1.00,
  volSfx: 1.00,
  volVoice: 1.00,

  /* --- accessibility --- */
  subtitles: true,
  hudScale: 1.00,
};

function clone(o) { var r = {}, k; for (k in o) if (Object.prototype.hasOwnProperty.call(o, k)) r[k] = o[k]; return r; }

var settings = clone(DEFAULTS);

function loadSettings() {
  var raw = null;
  try { raw = W.localStorage.getItem(SETTINGS_KEY); } catch (e) { /* storage off */ }
  settings = clone(DEFAULTS);
  if (!raw) return settings;
  var got;
  try { got = JSON.parse(raw); } catch (e) { return settings; }
  if (!got || typeof got !== 'object') return settings;
  /* Only keys this build knows about, and only if the type still
     matches. A saved string where a number belongs is a save from a
     different program as far as this one is concerned. */
  for (var k in DEFAULTS) {
    if (!Object.prototype.hasOwnProperty.call(got, k)) continue;
    if (got[k] === null && (k === 'padBinds' || k === 'keyBinds')) { settings[k] = null; continue; }
    if (typeof got[k] === typeof DEFAULTS[k] || DEFAULTS[k] === null) settings[k] = got[k];
  }
  return settings;
}

function saveSettings() {
  try { W.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* storage off */ }
  applySettings();
}

SHELL.get = function (k) { return settings[k]; };
SHELL.set = function (k, v) { settings[k] = v; saveSettings(); };
SHELL.all = function () { return clone(settings); };
SHELL.defaults = function () { return clone(DEFAULTS); };

/* ================================================================
   SETTINGS: applying them
   ================================================================
   A settings screen that does not change the game is a list of
   opinions. Every value above has exactly one place it lands, and this
   is that place; it runs on load, on every change, and after the game
   exists. Anything the game is not up yet to receive is skipped and
   picked up on the next call. */

var handle = null;      // { game, S, P } once the game is built

function applySettings() {
  SHELL.fpsTarget = fpsFor();
  var g = handle && handle.game;
  if (!g) return;

  /* Input, look and feel all go through one door: the game exposes
     S.applyShellSettings and copies what it can use onto itself under the
     names its own code already reads. Nothing here reaches into the
     game's internals by hand, so a rename in there breaks one function
     rather than fifteen lines of a menu. */
  if (handle.S && handle.S.applyShellSettings) handle.S.applyShellSettings(settings);

  /* Picture. The renderer's own quality record is what the engine reads
     every frame, so these are written into it rather than kept here. */
  var post = g.renderer && g.renderer.post;
  if (post) {
    if (post._b9bloom == null) post._b9bloom = post.bloom == null ? 0.5 : post.bloom;
    post.bloom = settings.gBloom ? post._b9bloom : 0;
    post.grain = settings.gGrain ? 0.022 : 0;
    post.vignette = settings.gVignette ? 0.28 : 0;
  }
  /* Shadows are switched on `renderer.shadows.enabled`, which is what the
     shadow pass and the uShadowStrength uniform both read. This wrote
     `renderer.quality.shadows` -- a key that does not exist in any of the
     five quality tiers and that nothing anywhere reads. Turning shadows
     off did nothing at all, which is one of the settings the player
     reported as not applying. */
  if (g.renderer && g.renderer.shadows) g.renderer.shadows.enabled = !!settings.gShadows;
  var qual = g.renderer && g.renderer.quality;
  if (qual) {
    qual.renderScale = settings.gRenderScale;
    /* The engine's loop already honours quality.fpsCap -- it counts up
       and skips a step until the interval is met. So the three limits
       are not a new mechanism, they are the one that is already there
       being told a different number depending on where the player is. */
    qual.fpsCap = SHELL.fpsTarget || 0;
  }
  /* A resize reallocates every framebuffer, so it happens when the
     render scale has actually MOVED -- not on every tick of every
     slider. Dragging the volume was rebuilding the render targets sixty
     times a second. */
  if (g.__b9scale !== settings.gRenderScale) {
    g.__b9scale = settings.gRenderScale;
    if (g.renderer && typeof g.renderer.setRenderScale === 'function') {
      try { g.renderer.setRenderScale(settings.gRenderScale); } catch (e) { /* older renderer */ }
    }
    if (g._doResize) { try { g._doResize(); } catch (e) { /* not sized yet */ } }
  }
  if (g.camera) { g.camera.far = settings.gViewDistance; }

  /* Sound. */
  /* setVolume, which is the method that exists. This called
     setMasterVolume -- there is no such method -- and otherwise poked
     master.gain.value directly. The gain node is created lazily on the
     first sound, so a volume set from the menu before anything had played
     went nowhere, and even when it landed it left audio.volume at its old
     value, so the next sound to touch it put the level back. */
  if (g.audio && typeof g.audio.setVolume === 'function') {
    try { g.audio.setVolume(settings.volMaster); } catch (e) { /* no context yet */ }
  }

  /* HUD size. */
  var hud = document.getElementById('b9hud');
  if (hud) hud.style.fontSize = (settings.hudScale * 100) + '%';
}

/* Which of the three frame limits is in force right now. The user asked
   for three because they are three different jobs: a menu should not run
   a laptop fan at 300 fps, and a round should have everything the display
   will take.

   The third one is honest about doing nothing. I wrote here that a paused
   game "is still drawing the room behind the panel"; it is not. `paused`
   short-circuits step(), and step() is both the simulation AND the render,
   so while the game is paused nothing is drawn at all -- the last frame
   simply stays on the canvas. The paused cap is kept because the setting
   is saved and shown, and because it will mean something the day the
   pause screen renders a live scene behind itself, but today it costs and
   saves nothing. */
var phase = 'menu';     // menu | game | paused

function fpsFor() {
  if (phase === 'paused') return settings.fpsPaused;
  if (phase === 'game') return settings.fpsGame;
  return settings.fpsMenu;
}

SHELL.fpsTarget = DEFAULTS.fpsMenu;

/* Changing phase changes which of the three limits is in force, and the
   limit lives on the renderer -- so this has to write it, not just work
   it out. Without the applySettings() call the cap set for the menu
   stayed on all the way into a round: sixty frames a second, in the
   game, with the setting that says uncapped sitting right there. */
function setPhase(p) { phase = p; SHELL.fpsTarget = fpsFor(); applySettings(); }
SHELL.phase = function () { return phase; };

/* The limiter is the engine's own. Its loop already reads
   renderer.quality.fpsCap and skips a step until the interval is met, so
   the three limits are not a new mechanism: they are that one being told
   a different number depending on where the player is standing. Written
   from applySettings, which runs on every change and on every phase
   switch, so a new cap holds on the next frame with nothing to restart. */
function installFrameLimiter(game) {
  if (!game || !game.renderer || !game.renderer.quality) return;
  game.renderer.quality.fpsCap = SHELL.fpsTarget || 0;
}

/* ================================================================
   THE SCREEN
   ================================================================
   One root element over everything, in the game's own colours: Georgia,
   bone white on a burnt brown, with the amber the HUD uses for anything
   you can act on.

   Every animation in the loading screen is a transform or an opacity and
   nothing else. That is not a style choice. Building the bunker is one
   long synchronous call -- the map, the pooled bodies, the viewmodel
   hands -- and while it runs the main thread cannot paint. Transform and
   opacity animations are handed to the compositor, which is a different
   thread, so the zombie keeps walking through the freeze. Animate a
   width or a left and it stops dead exactly when the player most needs
   to see that the game has not hung. */

var CSS = `
#b9shell { position:fixed; inset:0; z-index:2147482000; color:#e8ddc8;
  font-family:Georgia,'Times New Roman',serif; letter-spacing:.05em;
  background:#05060a; display:flex; align-items:center; justify-content:center;
  -webkit-font-smoothing:antialiased; }
#b9shell.gone { display:none; }
/* The game builds its character picker as part of its HUD and shows it
   the moment it exists. Until the player has chosen Zombies there is
   nothing to pick a character for, so it is held back here rather than
   by an argument threaded through the game -- one rule, removed in one
   place, and the game is unchanged. */
body.b9-preplay #b9hud .title { display:none !important; }
#b9shell .screen { position:absolute; inset:0; display:none; align-items:center; justify-content:center;
  flex-direction:column; }
#b9shell .screen.on { display:flex; }
#b9shell .fade { transition:opacity .9s ease; }

/* ---- loading ---- */
#b9shell .load { background:#05060a; }
#b9shell .loadwrap { width:min(620px,80vw); display:flex; flex-direction:column; align-items:center; }
#b9shell .lname { font-size:13px; letter-spacing:.52em; color:#6b6455; margin-bottom:44px;
  text-transform:uppercase; }
#b9shell .bar { position:relative; width:100%; height:6px; background:rgba(232,221,200,.13);
  overflow:hidden; }
#b9shell .fill { position:absolute; inset:0; background:#f2ece0; transform-origin:0 50%;
  transform:scaleX(0); transition:transform .35s linear; }
#b9shell .pct { margin-top:14px; font-size:15px; letter-spacing:.30em; color:#e8ddc8; }
#b9shell .step { margin-top:7px; font-size:11.5px; letter-spacing:.30em; color:#6b6455;
  text-transform:uppercase; min-height:14px; }
#b9shell .tip { position:absolute; bottom:8%; left:0; right:0; text-align:center; font-size:13px;
  color:#5d5749; font-style:italic; letter-spacing:.03em; padding:0 8vw; }

/* The ground the zombie walks on: one hairline, so it is walking rather
   than floating, without drawing a floor. */
#b9shell .walkline { width:100%; height:1px; background:rgba(232,221,200,.10); }
#b9shell .walker { position:relative; width:100%; height:150px; }

/* ---- the walking zombie ----
   A side view in SVG, one group per bone, each group rotating about its
   own joint. Boxes were tried first and thrown away: a limb made of divs
   is a rectangle, a rectangle rotated about a corner is a plank, and six
   planks stacked up is a scaffold rather than a body. Strokes with round
   caps are bones -- they taper into their joints, they overlap without a
   seam, and one path is a whole limb.

   The trick that makes the joints work: every bone is drawn straight
   DOWN from its own origin, inside a group that has already been
   translated to the joint. An SVG group's rotation is about its local
   origin, so rotating the inner group swings the bone about the joint
   with nothing to line up by hand -- and a child group translated to the
   end of the bone is the next joint down, for free.

   It is a silhouette because it is a loading spinner: no face, no
   colour, just the shape of something that should not still be walking. */
#b9shell .z { position:absolute; bottom:0; left:0; width:96px; height:150px;
  animation:b9cross 11s linear infinite; }
#b9shell .z svg { display:block; overflow:visible; }
#b9shell .z .bone { stroke:#cdc4b0; stroke-linecap:round; fill:none; }
#b9shell .z .far { opacity:.34; }
#b9shell .z .skin { fill:#cdc4b0; }
#b9shell .z .figure { animation:b9bob 1.25s ease-in-out infinite; }
#b9shell .z .spine { animation:b9lean 2.5s ease-in-out infinite; }
#b9shell .z .neck  { animation:b9loll 2.9s ease-in-out infinite; }
#b9shell .z .jaw   { animation:b9jaw 3.7s ease-in-out infinite; }
#b9shell .z .armFar  { animation:b9armF 1.25s ease-in-out infinite; }
#b9shell .z .armNear { animation:b9armN 1.25s ease-in-out infinite; }
#b9shell .z .foreFar  { animation:b9foreF 1.25s ease-in-out infinite; }
#b9shell .z .foreNear { animation:b9foreN 1.25s ease-in-out infinite; }
#b9shell .z .legFar  { animation:b9legF 1.25s ease-in-out infinite; }
#b9shell .z .legNear { animation:b9legN 1.25s ease-in-out infinite; }
#b9shell .z .shinFar  { animation:b9shinF 1.25s ease-in-out infinite; }
#b9shell .z .shinNear { animation:b9shinN 1.25s ease-in-out infinite; }

@keyframes b9cross { from { transform:translateX(-110px); } to { transform:translateX(calc(100% + 110px)); } }
/* Two dips per stride: one for each foot landing. */
@keyframes b9bob   { 0%,100% { transform:translateY(0); } 22% { transform:translateY(-4px); }
                     50% { transform:translateY(-1px); } 72% { transform:translateY(-2.5px); } }
@keyframes b9lean  { 0%,100% { transform:rotate(-2deg); } 50% { transform:rotate(1.5deg); } }
@keyframes b9loll  { 0%,100% { transform:rotate(9deg); } 40% { transform:rotate(-4deg); }
                     72% { transform:rotate(13deg); } }
@keyframes b9jaw   { 0%,66%,100% { transform:rotate(0deg); } 78% { transform:rotate(22deg); } }
/* Arms out in front and low, the way they are always drawn, but not
   level: one is higher than the other and neither is straight. */
@keyframes b9armF  { 0%,100% { transform:rotate(-64deg); } 50% { transform:rotate(-78deg); } }
@keyframes b9armN  { 0%,100% { transform:rotate(-82deg); } 50% { transform:rotate(-69deg); } }
@keyframes b9foreF { 0%,100% { transform:rotate(-18deg); } 50% { transform:rotate(-6deg); } }
@keyframes b9foreN { 0%,100% { transform:rotate(-7deg); } 50% { transform:rotate(-20deg); } }
/* The far leg walks. The near leg is the one it drags: a third of the
   swing, and the knee never straightens. */
@keyframes b9legF  { 0%,100% { transform:rotate(-26deg); } 50% { transform:rotate(22deg); } }
@keyframes b9legN  { 0%,100% { transform:rotate(7deg); } 50% { transform:rotate(-8deg); } }
@keyframes b9shinF { 0%,100% { transform:rotate(2deg); } 28% { transform:rotate(42deg); }
                     58% { transform:rotate(1deg); } }
@keyframes b9shinN { 0%,100% { transform:rotate(13deg); } 50% { transform:rotate(20deg); } }
@media (prefers-reduced-motion: reduce) {
  #b9shell .z, #b9shell .z * { animation:none !important; }
  #b9shell .z { transform:translateX(40%); }
}
`;

var CSS2 = `
/* ---- shared menu furniture ---- */
#b9shell .menu { background:linear-gradient(180deg,#07080c 0%,#0b0a08 55%,#05060a 100%); }
#b9shell .brand { text-align:center; margin-bottom:38px; }
#b9shell .brand h1 { margin:0; font-size:clamp(38px,7vw,74px); font-weight:normal; letter-spacing:.20em;
  color:#e8ddc8; text-shadow:0 3px 0 #000, 0 0 34px rgba(179,34,28,.30); }
#b9shell .brand h1 span { color:#b3221c; font-style:italic; }
#b9shell .brand p { margin:10px 0 0; font-size:12px; letter-spacing:.42em; color:#6b6455;
  text-transform:uppercase; }
#b9shell .list { display:flex; flex-direction:column; gap:2px; width:min(420px,80vw); }
#b9shell .item { display:flex; align-items:baseline; justify-content:space-between; gap:14px;
  padding:13px 18px; border:1px solid transparent; background:rgba(232,221,200,.03);
  font-size:20px; letter-spacing:.20em; text-transform:uppercase; cursor:pointer; }
#b9shell .item .hint { font-size:11px; letter-spacing:.16em; color:#6b6455; text-transform:none;
  font-style:italic; }
#b9shell .item.sel { border-color:#ffd27a; background:rgba(255,210,122,.10); color:#ffd27a; }
#b9shell .item.sel .hint { color:#b99a5e; }
#b9shell .item.off { color:#5d5749; cursor:default; }
#b9shell .foot { margin-top:26px; font-size:11.5px; letter-spacing:.20em; color:#5d5749;
  text-transform:uppercase; text-align:center; line-height:1.9; }
#b9shell .foot b { color:#8a8272; font-weight:normal; }

/* ---- settings ---- */
#b9shell .setwrap { width:min(980px,94vw); height:min(760px,90vh); display:flex; flex-direction:column;
  background:rgba(9,8,6,.97); border:1px solid #4a4234; }
#b9shell .sethead { display:flex; align-items:baseline; gap:20px; padding:16px 22px;
  border-bottom:1px solid #37312790; }
#b9shell .sethead h2 { margin:0; font-size:19px; font-weight:normal; letter-spacing:.28em; }
#b9shell .tabs { display:flex; gap:0; flex:1; flex-wrap:wrap; }
#b9shell .tab { padding:7px 13px; font-size:11.5px; letter-spacing:.18em; text-transform:uppercase;
  color:#6b6455; cursor:pointer; border-bottom:2px solid transparent; }
#b9shell .tab.sel { color:#ffd27a; border-bottom-color:#ffd27a; }
#b9shell .setbody { flex:1; overflow-y:auto; padding:10px 22px 22px; }
#b9shell .setbody::-webkit-scrollbar { width:9px; }
#b9shell .setbody::-webkit-scrollbar-thumb { background:#3a3428; }
#b9shell .sec { margin:18px 0 7px; font-size:11px; letter-spacing:.30em; color:#6b6455;
  text-transform:uppercase; border-bottom:1px solid #2a251d; padding-bottom:5px; }
#b9shell .row { display:flex; align-items:center; gap:16px; padding:9px 12px;
  border:1px solid transparent; }
#b9shell .row.sel { border-color:#ffd27a; background:rgba(255,210,122,.09); }
#b9shell .row .lbl { flex:0 0 42%; font-size:14.5px; }
#b9shell .row .lbl small { display:block; color:#6b6455; font-size:11.5px; letter-spacing:.02em;
  font-style:italic; margin-top:2px; }
#b9shell .row .ctl { flex:1; display:flex; align-items:center; gap:12px; justify-content:flex-end; }
#b9shell .row .val { min-width:76px; text-align:right; color:#ffd27a; font-size:14px;
  font-variant-numeric:tabular-nums; }
#b9shell .slide { position:relative; flex:1; max-width:280px; height:4px; background:rgba(232,221,200,.14); }
#b9shell .slide .k { position:absolute; top:-5px; width:3px; height:14px; background:#ffd27a; }
#b9shell .slide .f { position:absolute; left:0; top:0; bottom:0; background:rgba(255,210,122,.45); }
#b9shell .chip { padding:5px 13px; border:1px solid #4a4234; font-size:12px; letter-spacing:.16em;
  text-transform:uppercase; color:#8a8272; cursor:pointer; }
#b9shell .chip.on { border-color:#8ce8a0; color:#8ce8a0; }
#b9shell .chip.pick { border-color:#ffd27a; color:#ffd27a; }
#b9shell .setfoot { padding:12px 22px; border-top:1px solid #37312790; display:flex; gap:22px;
  align-items:center; font-size:11.5px; letter-spacing:.16em; color:#6b6455; text-transform:uppercase; }
#b9shell .setfoot b { color:#ffd27a; font-weight:normal; }
#b9shell .setfoot .sp { flex:1; }

/* The device panel: whatever you are actually holding, drawn. */
#b9shell .device { display:flex; gap:22px; align-items:center; padding:14px 12px;
  border:1px solid #37312790; background:rgba(232,221,200,.02); margin-bottom:6px; }
#b9shell .device svg { flex:0 0 auto; }
#b9shell .device .dtxt { font-size:13px; line-height:1.7; }
#b9shell .device .dtxt b { display:block; color:#8ce8a0; font-weight:normal; letter-spacing:.16em;
  font-size:12px; text-transform:uppercase; }
#b9shell .device .dtxt .warn { color:#ffc061; }
#b9shell .device .dtxt small { color:#6b6455; font-style:italic; }

/* Live meters: the microphone level, and the stick positions. */
#b9shell .meter { position:relative; width:260px; height:9px; background:rgba(232,221,200,.12); }
#b9shell .meter .m { position:absolute; left:0; top:0; bottom:0; width:0; background:#8ce8a0;
  transition:width .06s linear; }
#b9shell .meter .gate { position:absolute; top:-3px; bottom:-3px; width:2px; background:#ffc061; }

/* The feedback box. */
#b9shell textarea { width:100%; height:150px; background:rgba(0,0,0,.45); color:#e8ddc8;
  border:1px solid #4a4234; padding:11px 13px; font:14px/1.6 Georgia,serif; resize:none; outline:none; }
#b9shell textarea:focus { border-color:#ffd27a; }
#b9shell .sent { color:#8ce8a0; font-size:12.5px; letter-spacing:.14em; text-transform:uppercase; }

/* ---- pause ---- */
#b9shell.thin { background:rgba(5,6,10,.72); }
#b9shell .pausewrap { width:min(1080px,95vw); max-height:92vh; overflow-y:auto;
  background:rgba(9,8,6,.96); border:1px solid #4a4234; padding:20px 24px 24px; }
#b9shell .pausehead { display:flex; align-items:baseline; gap:18px; border-bottom:1px solid #37312790;
  padding-bottom:12px; margin-bottom:16px; }
#b9shell .pausehead h2 { margin:0; font-size:20px; font-weight:normal; letter-spacing:.28em; }
#b9shell .pausehead .rd { color:#b3221c; font-style:italic; font-size:26px; }
#b9shell .pausehead .sp { flex:1; }
#b9shell table { width:100%; border-collapse:collapse; font-size:13.5px; }
#b9shell th { text-align:right; font-weight:normal; font-size:10.5px; letter-spacing:.20em;
  color:#6b6455; text-transform:uppercase; padding:0 9px 7px; border-bottom:1px solid #2a251d; }
#b9shell th:first-child, #b9shell td:first-child { text-align:left; }
#b9shell td { text-align:right; padding:7px 9px; border-bottom:1px solid #1b1813;
  font-variant-numeric:tabular-nums; }
#b9shell tr.me td { color:#ffd27a; }
#b9shell td .perkdots { display:inline-flex; gap:4px; }
#b9shell td .pd { width:9px; height:9px; border-radius:50%; display:inline-block; }
#b9shell .gunlist { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:2px; }
#b9shell .gun { display:flex; justify-content:space-between; gap:10px; padding:7px 11px;
  background:rgba(232,221,200,.03); font-size:13px; }
#b9shell .gun .n { color:#c8bfa8; }
#b9shell .gun .k { color:#ffd27a; font-variant-numeric:tabular-nums; }
#b9shell .gun .k small { color:#6b6455; }
#b9shell .pauseacts { display:flex; gap:2px; margin-top:18px; }
#b9shell .pauseacts .item { flex:1; justify-content:center; font-size:15px; }
`;

/* ================================================================
   MARKUP
   ================================================================ */

var root = null, el = {};

function q(sel) { return root.querySelector(sel); }

function buildDom() {
  var st = document.createElement('style');
  st.textContent = CSS + CSS2;
  document.head.appendChild(st);

  root = document.createElement('div');
  root.id = 'b9shell';
  document.body.classList.add('b9-preplay');
  root.innerHTML = `
  <div class="screen load on fade">
    <div class="loadwrap">
      <div class="lname">Bunker Nine</div>
      <div class="walker">
        <div class="z">
          <svg width="96" height="150" viewBox="0 0 96 150" aria-label="loading">
            <g class="figure">
              <!-- Far side first, so the near arm and leg draw over the body. -->
              <g transform="translate(40,52)"><g class="armFar">
                <path class="bone far" stroke-width="8" d="M0,0 L0,26"/>
                <g transform="translate(0,26)"><g class="foreFar">
                  <path class="bone far" stroke-width="7" d="M0,0 L0,24"/>
                  <path class="bone far" stroke-width="9" d="M0,24 L2,29"/>
                </g></g>
              </g></g>
              <g transform="translate(34,84)"><g class="legFar">
                <path class="bone far" stroke-width="12" d="M0,0 L0,30"/>
                <g transform="translate(0,30)"><g class="shinFar">
                  <path class="bone far" stroke-width="10" d="M0,0 L0,30"/>
                  <path class="bone far" stroke-width="7" d="M0,30 L13,31"/>
                </g></g>
              </g></g>

              <!-- Spine, neck and head. -->
              <g transform="translate(34,84)"><g class="spine">
                <path class="bone" stroke-width="19" d="M0,0 L6,-36"/>
                <g transform="translate(7,-40)"><g class="neck">
                  <path class="bone" stroke-width="9" d="M0,0 L3,-8"/>
                  <ellipse class="skin" cx="7" cy="-16" rx="11" ry="9.5"/>
                  <g transform="translate(9,-12)"><g class="jaw">
                    <path class="bone" stroke-width="5" d="M0,0 L8,1"/>
                  </g></g>
                </g></g>
              </g></g>

              <!-- Near side. -->
              <g transform="translate(34,86)"><g class="legNear">
                <path class="bone" stroke-width="12" d="M0,0 L0,30"/>
                <g transform="translate(0,30)"><g class="shinNear">
                  <path class="bone" stroke-width="10" d="M0,0 L0,30"/>
                  <path class="bone" stroke-width="7" d="M0,30 L13,31"/>
                </g></g>
              </g></g>
              <g transform="translate(41,50)"><g class="armNear">
                <path class="bone" stroke-width="8" d="M0,0 L0,26"/>
                <g transform="translate(0,26)"><g class="foreNear">
                  <path class="bone" stroke-width="7" d="M0,0 L0,24"/>
                  <path class="bone" stroke-width="9" d="M0,24 L2,29"/>
                </g></g>
              </g></g>
            </g>
          </svg>
        </div>
      </div>
      <div class="walkline"></div>
      <div class="bar"><div class="fill"></div></div>
      <div class="pct">0%</div>
      <div class="step">starting</div>
    </div>
    <div class="tip"></div>
  </div>

  <div class="screen menu fade">
    <div class="brand"><h1>BUNKER <span>NINE</span></h1><p>the dead come through the windows</p></div>
    <div class="list mainlist"></div>
    <div class="foot"></div>
  </div>

  <div class="screen setscreen">
    <div class="setwrap">
      <div class="sethead"><h2>SETTINGS</h2><div class="tabs"></div></div>
      <div class="setbody"></div>
      <div class="setfoot"></div>
    </div>
  </div>

  <div class="screen pause">
    <div class="pausewrap">
      <div class="pausehead"><h2>PAUSED</h2><span class="sp"></span>
        <span style="font-size:11px;letter-spacing:.24em;color:#6b6455">ROUND</span>
        <span class="rd">1</span></div>
      <div class="pbody"></div>
      <div class="pauseacts"></div>
    </div>
  </div>`;
  document.body.appendChild(root);

  el = {
    load: q('.load'), menu: q('.menu'), setscreen: q('.setscreen'), pause: q('.pause'),
    fill: q('.fill'), pct: q('.pct'), step: q('.step'), tip: q('.tip'),
    mainlist: q('.mainlist'), mfoot: q('.menu .foot'),
    tabs: q('.tabs'), setbody: q('.setbody'), setfoot: q('.setfoot'),
    pbody: q('.pbody'), pauseacts: q('.pauseacts'), prd: q('.pausehead .rd'),
  };
}

function show(which) {
  ['load', 'menu', 'setscreen', 'pause'].forEach(function (k) {
    el[k].classList.toggle('on', k === which);
  });
  root.classList.remove('gone');
  root.classList.toggle('thin', which === 'pause');
}

function hideAll() { root.classList.add('gone'); }

/* ================================================================
   LOADING
   ================================================================
   Six steps, and every one of them is a thing that actually happens.
   The weights are how long each took on the machine this was built on,
   normalised -- so the bar moves at roughly a constant rate rather than
   sitting at 20% and then jumping to done.

   Building the bunker is the one step that cannot report from inside
   itself: it is a single synchronous call and the main thread is gone
   for its whole duration, so there is nothing to paint an update with.
   Rather than invent sub-steps, the bar is told to travel that segment
   over the duration the LAST boot on this machine actually took, saved
   in localStorage, and the compositor animates it while the thread is
   busy. First run has no measurement and uses 3.8 s, which is what a
   release build measured. When the call returns the bar snaps to the
   true value, early or late. */

var STEPS = [
  { id: 'engine',  label: 'waking the engine',        w: 2 },
  { id: 'body',    label: 'reading the body',         w: 12 },
  { id: 'online',  label: 'connecting to services',   w: 8 },
  { id: 'audio',   label: 'opening the audio device', w: 3 },
  { id: 'build',   label: 'building the bunker',      w: 68 },
  { id: 'first',   label: 'first frame',              w: 7 },
];

var TIPS = [
  'Points buy everything. The doors, the guns, the machines, and the box.',
  'A head is worth a hundred; a body is worth sixty. The difference adds up by round nine.',
  'The boards on a window can be put back by hand. It costs nothing but the time you do not have.',
  'Adrenaline gives you three minutes of sprint and a reload at double speed.',
  'Deflect stops anything thrown at you. It does nothing about the ones with hands.',
  'The workbench is downstairs. The dealer there fits parts nobody else will.',
  'Shield Up makes them forget where you are. Standing still helps them remember.',
  'The Arc Breaker does not kill the one you shot. It kills what that one is connected to.',
  'The fat ones are slow and they do not fall over when you would like them to.',
  'Something came through the wing roof. It is still down there.',
];

function setBar(frac, label, seconds) {
  var f = Math.max(0, Math.min(1, frac));
  el.fill.style.transitionDuration = (seconds == null ? 0.35 : seconds) + 's';
  el.fill.style.transform = 'scaleX(' + f + ')';
  if (label != null) el.step.textContent = label;
  el.pct.textContent = Math.round(f * 100) + '%';
}

/* The percentage has to keep counting while the thread is blocked, or
   the number and the bar disagree for three seconds. It cannot -- there
   is no thread to count on. So during the long step the number is
   driven by the same CSS transition as the bar: it is set to the END of
   the segment when the segment starts, and the text underneath says
   what is happening. Truthful, and it never shows a number the bar has
   not reached. */

function frame() { return new Promise(function (r) { W.requestAnimationFrame(function () { r(); }); }); }
function twoFrames() { return frame().then(frame); }

function weightBefore(i) {
  var t = 0, s = 0, k;
  for (k = 0; k < STEPS.length; k++) t += STEPS[k].w;
  for (k = 0; k < i; k++) s += STEPS[k].w;
  return s / t;
}
function weightAfter(i) {
  var t = 0, k;
  for (k = 0; k < STEPS.length; k++) t += STEPS[k].w;
  return weightBefore(i) + STEPS[i].w / t;
}

var BUILD_MS_KEY = 'b9.buildms';

SHELL.boot = function (opts) {
  opts = opts || {};
  loadSettings();
  buildDom();
  show('load');
  el.tip.textContent = TIPS[(Math.random() * TIPS.length) | 0];
  setBar(0, STEPS[0].label);

  var B = W.BUNKER;
  var online = { ok: false, why: 'offline mode' };

  var chain = Promise.resolve();

  // 0 -- engine
  chain = chain.then(function () {
    setBar(weightBefore(0), STEPS[0].label);
    return twoFrames();
  }).then(function () {
    if (!W.LE || !B) throw new Error('engine or game script missing');
    setBar(weightAfter(0));
    return frame();
  });

  // 1 -- the imported zombie body
  chain = chain.then(function () {
    setBar(weightBefore(1), STEPS[1].label);
    return twoFrames().then(function () { return B.preload(opts.base); });
  }).then(function (got) {
    SHELL.walkerLoaded = !!got;
    setBar(weightAfter(1));
    return frame();
  });

  // 2 -- online services, if the player wants them
  chain = chain.then(function () {
    setBar(weightBefore(2), settings.online ? STEPS[2].label : 'staying offline');
    return twoFrames().then(function () {
      if (!settings.online) return { ok: false, why: 'offline by choice' };
      return checkOnline();
    });
  }).then(function (r) {
    online = r;
    SHELL.online = r;
    setBar(weightAfter(2));
    return frame();
  });

  // 3 -- audio device
  chain = chain.then(function () {
    setBar(weightBefore(3), STEPS[3].label);
    return twoFrames().then(openAudio);
  }).then(function () {
    setBar(weightAfter(3));
    return frame();
  });

  // 4 -- the bunker itself
  chain = chain.then(function () {
    var est = 3800;
    try { est = +W.localStorage.getItem(BUILD_MS_KEY) || 3800; } catch (e) { /* storage off */ }
    est = Math.max(400, Math.min(20000, est));
    // Hand the segment to the compositor before the thread goes away.
    setBar(weightAfter(4), STEPS[4].label, est / 1000);
    return twoFrames().then(function () {
      var t0 = (W.performance && performance.now) ? performance.now() : Date.now();
      handle = B.start({ canvas: opts.canvas || '#game', settings: SHELL.all() });
      var ms = ((W.performance && performance.now) ? performance.now() : Date.now()) - t0;
      try { W.localStorage.setItem(BUILD_MS_KEY, Math.round(ms)); } catch (e) { /* storage off */ }
      SHELL.buildMs = Math.round(ms);
      installFrameLimiter(handle.game);
      applySettings();
    });
  });

  // 5 -- let it draw once before anybody looks at it
  chain = chain.then(function () {
    setBar(weightBefore(5), STEPS[5].label);
    return frame().then(frame).then(frame);
  }).then(function () {
    setBar(1, 'ready');
    return new Promise(function (r) { setTimeout(r, 260); });
  }).then(function () {
    fadeToMenu();
  });

  chain.catch(function (err) {
    el.step.textContent = 'failed: ' + (err && err.message ? err.message : String(err));
    el.step.style.color = '#ff6a5a';
    el.pct.textContent = '';
    // eslint-disable-next-line no-console
    console.error('[bunker nine] boot failed', err);
  });

  return chain;
};

/* Is there anything out there? A HEAD at the page's own origin with a
   short timeout: it answers the only question the game can actually act
   on, which is whether the network is up, and it does not talk to
   anybody the player did not already load the page from. */
function checkOnline() {
  if (!W.navigator || W.navigator.onLine === false) {
    return Promise.resolve({ ok: false, why: 'the browser says there is no network' });
  }
  if (typeof W.fetch !== 'function' || typeof W.AbortController !== 'function') {
    return Promise.resolve({ ok: !!W.navigator.onLine, why: 'assumed from the browser' });
  }
  var ac = new W.AbortController();
  var t = setTimeout(function () { ac.abort(); }, 2500);
  return W.fetch(W.location.href, { method: 'HEAD', cache: 'no-store', signal: ac.signal })
    .then(function (r) { clearTimeout(t); return { ok: !!r && r.ok, why: r && r.ok ? 'connected' : 'host answered ' + (r && r.status) }; })
    .catch(function () { clearTimeout(t); return { ok: false, why: 'no answer from the host' }; });
}

/* Browsers will not start an AudioContext until the page has been
   touched, so this creates it and reports whether it is running. If it
   is suspended the first click anywhere resumes it -- which is the click
   that starts the game anyway. */
var audioCtx = null;
function openAudio() {
  var AC = W.AudioContext || W.webkitAudioContext;
  if (!AC) return Promise.resolve(false);
  try { audioCtx = new AC(); } catch (e) { return Promise.resolve(false); }
  SHELL.audio = audioCtx;
  var wake = function () {
    if (audioCtx.state === 'suspended') audioCtx.resume().catch(function () {});
  };
  W.addEventListener('pointerdown', wake);
  W.addEventListener('keydown', wake);
  return Promise.resolve(audioCtx.state === 'running');
}

function fadeToMenu() {
  el.load.style.opacity = 0;
  setTimeout(function () {
    el.load.style.opacity = '';
    setPhase('menu');
    openMain();
  }, 900);
}

/* ================================================================
   NAVIGATION
   ================================================================
   One focus model for every screen here, driven by three input sources
   at once: keyboard, mouse and gamepad. That is the whole of "controller
   support in the menus" -- there is no second code path for a pad, the
   pad simply moves the same cursor the arrow keys move.

   A screen registers rows. A row can be entered (Enter / A / click),
   nudged left and right (arrows / d-pad / stick / drag), and it can say
   it is not selectable. Everything else -- wrapping, scrolling the
   focused row into view, repeat rate on a held stick -- is here once. */

var nav = { rows: [], i: 0, onBack: null, live: false };

function navSet(rows, onBack, keep) {
  nav.rows = rows.filter(function (r) { return r && !r.skip; });
  nav.onBack = onBack || null;
  if (!keep || nav.i >= nav.rows.length) nav.i = 0;
  while (nav.i < nav.rows.length && nav.rows[nav.i].disabled) nav.i++;
  if (nav.i >= nav.rows.length) nav.i = 0;
  nav.live = true;
  navPaint(false);
}

function navClear() { nav.rows = []; nav.live = false; nav.onBack = null; }

/* `scroll` is opt-in, and that is the whole of a bug that made two
   different things look broken.
 *
 * Hovering a row focuses it, so the pointer and the pad never disagree.
 * Focusing used to scroll the row into view -- right for a keyboard,
 * wrong for a mouse, because the list is in a scrolling panel and a row
 * that is only half visible SHIFTS THE WHOLE LIST UNDER THE CURSOR the
 * moment you hover it. By the time the click lands, a different row is
 * under the pointer. That is "clicking a graphics preset picks the one
 * next to it", and it is also why rebinding looked dead: you clicked
 * "Move forward", the list moved, you armed "Move back" instead, and the
 * row you were watching never changed.
 *
 * Only the keyboard and the pad scroll now. A pointer is already
 * pointing at the thing it means. */
function navPaint(scroll) {
  for (var k = 0; k < nav.rows.length; k++) {
    var r = nav.rows[k];
    if (r.el) r.el.classList.toggle('sel', k === nav.i);
  }
  var cur = nav.rows[nav.i];
  if (scroll && cur && cur.el && cur.el.scrollIntoView) {
    cur.el.scrollIntoView({ block: 'nearest' });
  }
}

function navMove(d) {
  if (!nav.rows.length) return;
  var n = nav.rows.length, k = nav.i, guard = 0;
  do { k = (k + d + n) % n; guard++; } while (nav.rows[k].disabled && guard <= n);
  nav.i = k;
  navPaint(true);
  beep('move');
}

function navSide(d) {
  var r = nav.rows[nav.i];
  if (!r || r.disabled) return;
  if (d < 0 && r.onLeft) { r.onLeft(); beep('tick'); }
  if (d > 0 && r.onRight) { r.onRight(); beep('tick'); }
}

function navEnter() {
  var r = nav.rows[nav.i];
  if (!r || r.disabled || !r.onEnter) return;
  beep('ok');
  r.onEnter();
}

function navBack() { if (nav.onBack) { beep('back'); nav.onBack(); } }

/* A menu with no sound is a menu that does not feel connected to the
   button. Four short shapes off the same oscillator -- this runs before
   the game's own audio exists, so it uses the context the loader opened. */
function beep(kind) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  if (!settings.volMaster) return;
  try {
    var t = audioCtx.currentTime;
    var o = audioCtx.createOscillator(), g = audioCtx.createGain();
    var f = kind === 'ok' ? 520 : kind === 'back' ? 200 : kind === 'tick' ? 780 : 340;
    o.type = 'square';
    o.frequency.setValueAtTime(f, t);
    if (kind === 'ok') o.frequency.exponentialRampToValueAtTime(f * 1.5, t + 0.06);
    var vol = 0.030 * settings.volMaster * settings.volSfx;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (kind === 'ok' ? 0.13 : 0.06));
    o.connect(g); g.connect(audioCtx.destination);
    o.start(t); o.stop(t + 0.16);
  } catch (e) { /* audio can refuse at any time; a menu still works silently */ }
}

/* ---- keyboard ---- */
W.addEventListener('keydown', function (e) {
  if (!nav.live) return;
  /* A rebind that is waiting for a key gets the key, and this handler
     does not touch it. Otherwise the menu eats W, A, S, D, the arrows,
     Enter, Space, Tab and Escape before the capture ever sees them --
     which is most of what anybody wants to bind, and is why arming one
     and pressing a key looked like it did nothing at all. */
  if (capturing) return;
  if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) {
    if (e.key === 'Escape') { e.target.blur(); e.preventDefault(); }
    return;
  }
  var k = e.key;
  if (k === 'ArrowUp' || k === 'w' || k === 'W') { navMove(-1); e.preventDefault(); }
  else if (k === 'ArrowDown' || k === 's' || k === 'S') { navMove(1); e.preventDefault(); }
  else if (k === 'ArrowLeft' || k === 'a' || k === 'A') { navSide(-1); e.preventDefault(); }
  else if (k === 'ArrowRight' || k === 'd' || k === 'D') { navSide(1); e.preventDefault(); }
  else if (k === 'Enter' || k === ' ') { navEnter(); e.preventDefault(); }
  else if (k === 'Escape' || k === 'Backspace') { navBack(); e.preventDefault(); }
  else if (k === 'Tab') { navMove(e.shiftKey ? -1 : 1); e.preventDefault(); }
}, true);

/* ---- gamepad ----
   Polled here rather than borrowed from the game, because the menus have
   to work before the game exists and while it is paused. Edge-detected,
   with the same held-direction repeat a d-pad menu has always had: a
   third of a second to the first repeat, then eight a second. */
var padPrev = {}, padRepeat = 0, padDir = 0;
var PAD_FIRST = 0.34, PAD_RATE = 0.125;
var lastPoll = 0;

function pollPad(now) {
  var dt = lastPoll ? Math.min(0.1, (now - lastPoll) / 1000) : 0;
  lastPoll = now;
  if (!nav.live || !W.navigator || !navigator.getGamepads) return;
  // Same as the keyboard: a waiting capture gets the button.
  if (capturing) { SHELL.pad = (navigator.getGamepads() || [])[0] || SHELL.pad; return; }
  var pads = navigator.getGamepads(), p = null, k;
  for (k = 0; k < pads.length; k++) if (pads[k] && pads[k].connected) { p = pads[k]; break; }
  SHELL.pad = p;
  if (!p) { padPrev = {}; padDir = 0; return; }

  var std = p.mapping === 'standard';
  var b = p.buttons || [];
  var down = function (i) { return !!(b[i] && (b[i].pressed || b[i].value > 0.5)); };
  var edge = function (name, on) {
    var was = !!padPrev[name]; padPrev[name] = on;
    return on && !was;
  };

  /* Left stick and d-pad both steer. On a pad the browser does not
     recognise, the button numbers are not trustworthy, so only the axes
     are used and the confirm falls back to "any button". */
  var ax = p.axes || [];
  var lx = ax.length > 0 ? ax[0] : 0, ly = ax.length > 1 ? ax[1] : 0;
  var dz = settings.deadzoneLeft;
  var vy = Math.abs(ly) > dz ? ly : 0, vx = Math.abs(lx) > dz ? lx : 0;
  if (std) {
    if (down(12)) vy = -1; else if (down(13)) vy = 1;
    if (down(14)) vx = -1; else if (down(15)) vx = 1;
  }
  var dir = vy < -0.5 ? -1 : vy > 0.5 ? 1 : 0;
  var sdir = vx < -0.5 ? -1 : vx > 0.5 ? 1 : 0;

  if (dir !== padDir) { padDir = dir; padRepeat = PAD_FIRST; if (dir) navMove(dir); }
  else if (dir) { padRepeat -= dt; if (padRepeat <= 0) { padRepeat = PAD_RATE; navMove(dir); } }

  if (edge('side' + sdir, !!sdir) && sdir) navSide(sdir);
  if (!sdir) { padPrev['side1'] = false; padPrev['side-1'] = false; }

  if (std) {
    if (edge('a', down(0))) navEnter();
    if (edge('b', down(1))) navBack();
    if (edge('lb', down(4))) navTab(-1);
    if (edge('rb', down(5))) navTab(1);
    if (edge('start', down(9))) navStart();
  } else {
    var any = false;
    for (k = 0; k < b.length; k++) if (down(k)) { any = true; break; }
    if (edge('any', any)) navEnter();
  }
}

/* Bumpers page through the tabs on the settings screen; Start is the
   pause toggle. Both are no-ops on a screen that has neither. */
var tabHook = null, startHook = null;
function navTab(d) { if (tabHook) { tabHook(d); beep('move'); } }
function navStart() { if (startHook) { startHook(); } }

function pump(now) { pollPad(now); W.requestAnimationFrame(pump); }
W.requestAnimationFrame(pump);

/* ---- mouse ----
   Hovering a row focuses it, so the pointer and the pad never disagree
   about what is selected. */
function wire(row) {
  if (!row.el) return row;
  var self = row;
  row.el.addEventListener('mouseenter', function () {
    var k = nav.rows.indexOf(self);
    if (k >= 0 && !self.disabled) { nav.i = k; navPaint(false); }
  });
  row.el.addEventListener('click', function (e) {
    var k = nav.rows.indexOf(self);
    if (k >= 0) { nav.i = k; navPaint(false); }
    if (self.onClick) self.onClick(e);
    else if (self.onEnter && !self.disabled) { beep('ok'); self.onEnter(); }
  });
  return row;
}

/* ================================================================
   MAIN MENU
   ================================================================
   Two entries, because two is what the game has. A third that says
   "quit" in a browser tab would be a lie. */

function mkItem(text, hint, cls) {
  var d = document.createElement('div');
  d.className = 'item' + (cls ? ' ' + cls : '');
  d.innerHTML = '<span class="t"></span><span class="hint"></span>';
  d.querySelector('.t').textContent = text;
  d.querySelector('.hint').textContent = hint || '';
  return d;
}

function openMain() {
  show('menu');
  setPhase('menu');
  el.mainlist.innerHTML = '';
  var rows = [];

  var zombies = mkItem('Zombies', 'one bunker, no way out');
  el.mainlist.appendChild(zombies);
  rows.push(wire({ el: zombies, onEnter: intoGame }));

  var sets = mkItem('Settings', 'controls, picture, sound, and the rest');
  el.mainlist.appendChild(sets);
  rows.push(wire({ el: sets, onEnter: function () { openSettings('main'); } }));

  var svc = SHELL.online && SHELL.online.ok;
  el.mfoot.innerHTML =
    '<div><b>' + (svc ? 'ONLINE' : 'OFFLINE') + '</b> &middot; '
    + ((SHELL.online && SHELL.online.why) || 'not checked') + '</div>'
    + '<div>' + (SHELL.walkerLoaded ? 'body model loaded' : 'procedural bodies')
    + ' &middot; built in ' + ((SHELL.buildMs || 0) / 1000).toFixed(1) + ' s</div>'
    + '<div><b>&uarr;&darr;</b> move &nbsp; <b>Enter / A</b> choose &nbsp; <b>Esc / B</b> back</div>';

  navSet(rows, null);
  tabHook = null; startHook = null;
}

/* Into the game. The character picker the game already owns IS the last
   step of the main menu, so this hands over to it rather than building a
   second one: the shell steps out of the way and the title screen, which
   knows every hero and their bio, takes the click. */
function intoGame() {
  hideAll();
  navClear();
  setPhase('game');
  document.body.classList.remove('b9-preplay');
  var hud = document.getElementById('b9hud');
  if (hud) {
    var t = hud.querySelector('.title');
    if (t) { t.style.display = 'flex'; t.style.opacity = 1; }
  }
  installPause();
}

/* ================================================================
   SETTINGS
   ================================================================
   Six tabs. Every row here writes into the settings object and calls
   applySettings(), so there is no apply button and nothing to forget to
   press -- the change is in the game before your thumb is off the stick.
   */

var TABS = [
  { id: 'controls', name: 'Controls' },
  { id: 'gamepad',  name: 'Controller' },
  { id: 'audio',    name: 'Audio & Mic' },
  { id: 'video',    name: 'Graphics' },
  { id: 'frames',   name: 'Frame Rate' },
  { id: 'about',    name: 'Feedback' },
];
var curTab = 'controls';
var backTo = 'main';

function openSettings(from) {
  backTo = from || 'main';
  show('setscreen');
  paintTabs();
  paintTab(false);
  tabHook = function (d) {
    var i = TABS.map(function (t) { return t.id; }).indexOf(curTab);
    curTab = TABS[(i + d + TABS.length) % TABS.length].id;
    paintTabs(); paintTab(false);
  };
  startHook = null;
}

function closeSettings() {
  stopMic();
  if (backTo === 'pause') openPause();
  else openMain();
}

function paintTabs() {
  el.tabs.innerHTML = '';
  TABS.forEach(function (t) {
    var d = document.createElement('div');
    d.className = 'tab' + (t.id === curTab ? ' sel' : '');
    d.textContent = t.name;
    d.addEventListener('click', function () { curTab = t.id; paintTabs(); paintTab(false); });
    el.tabs.appendChild(d);
  });
  el.setfoot.innerHTML =
    '<span><b>&uarr;&darr;</b> row</span><span><b>&larr;&rarr;</b> change</span>'
    + '<span><b>LB / RB</b> tab</span><span class="sp"></span>'
    + '<span><b>Esc / B</b> back</span>';
}

/* ---- row builders ----
   Four shapes cover every setting in the game: a slider, a switch, a
   list of choices, and a button. Each returns a nav row, so a screen is
   a list of these and nothing else. */

function rowShell(label, note) {
  var d = document.createElement('div');
  d.className = 'row';
  d.innerHTML = '<div class="lbl"></div><div class="ctl"></div>';
  d.querySelector('.lbl').textContent = label;
  if (note) {
    var s = document.createElement('small');
    s.textContent = note;
    d.querySelector('.lbl').appendChild(s);
  }
  return d;
}

function fmt(key, v) {
  if (key === 'sensitivity' || key === 'padSensitivity' || key === 'adsMultiplier'
    || key === 'micGain' || key === 'vibrationStrength' || key === 'gParticles'
    || key === 'gRenderScale' || key === 'hudScale'
    || key === 'volMaster' || key === 'volSfx' || key === 'volVoice') return v.toFixed(2) + '×';
  if (key === 'deadzoneLeft' || key === 'deadzoneRight' || key === 'triggerThreshold'
    || key === 'micGate') return Math.round(v * 100) + '%';
  if (key === 'gViewDistance') return Math.round(v) + ' m';
  return String(v);
}

function slider(label, note, key, lo, hi, stepv) {
  var d = rowShell(label, note);
  var ctl = d.querySelector('.ctl');
  ctl.innerHTML = '<div class="slide"><div class="f"></div><div class="k"></div></div><div class="val"></div>';
  var f = ctl.querySelector('.f'), k = ctl.querySelector('.k'), val = ctl.querySelector('.val');
  var paint = function () {
    var u = (settings[key] - lo) / (hi - lo);
    u = Math.max(0, Math.min(1, u));
    f.style.width = (u * 100) + '%';
    k.style.left = 'calc(' + (u * 100) + '% - 1px)';
    val.textContent = fmt(key, settings[key]);
  };
  var nudge = function (d2) {
    var v = Math.round((settings[key] + d2 * stepv) / stepv) * stepv;
    settings[key] = Math.max(lo, Math.min(hi, +v.toFixed(4)));
    paint(); saveSettings();
  };
  /* Dragging works too. A slider you can only step is a slider that
     takes forty presses to cross, and a mouse is right there. */
  var track = ctl.querySelector('.slide');
  var drag = function (e) {
    var r = track.getBoundingClientRect();
    var u = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
    var v = Math.round((lo + u * (hi - lo)) / stepv) * stepv;
    settings[key] = Math.max(lo, Math.min(hi, +v.toFixed(4)));
    paint(); saveSettings();
  };
  track.addEventListener('pointerdown', function (e) {
    track.setPointerCapture(e.pointerId); drag(e);
    var mv = function (e2) { if (e2.buttons) drag(e2); };
    var up = function () { track.removeEventListener('pointermove', mv); track.removeEventListener('pointerup', up); };
    track.addEventListener('pointermove', mv); track.addEventListener('pointerup', up);
  });
  paint();
  return wire({ el: d, onLeft: function () { nudge(-1); }, onRight: function () { nudge(1); },
    onClick: function () {}, repaint: paint });
}

function toggle(label, note, key, onName, offName) {
  var d = rowShell(label, note);
  var ctl = d.querySelector('.ctl');
  ctl.innerHTML = '<div class="chip"></div>';
  var chip = ctl.querySelector('.chip');
  var paint = function () {
    chip.textContent = settings[key] ? (onName || 'On') : (offName || 'Off');
    chip.classList.toggle('on', !!settings[key]);
  };
  var flip = function () { settings[key] = !settings[key]; paint(); saveSettings(); };
  paint();
  return wire({ el: d, onEnter: flip, onLeft: flip, onRight: flip, repaint: paint });
}

function choice(label, note, key, opts) {
  var d = rowShell(label, note);
  var ctl = d.querySelector('.ctl');
  var chips = opts.map(function (o) {
    var c = document.createElement('div');
    c.className = 'chip';
    c.textContent = o.name;
    c.addEventListener('click', function (e) { e.stopPropagation(); pick(o.v); });
    ctl.appendChild(c);
    return c;
  });
  var paint = function () {
    opts.forEach(function (o, i) { chips[i].classList.toggle('pick', settings[key] === o.v); });
  };
  var pick = function (v) { settings[key] = v; paint(); saveSettings(); if (opts.after) opts.after(); };
  var step = function (d2) {
    var i = opts.map(function (o) { return o.v; }).indexOf(settings[key]);
    if (i < 0) i = 0;
    pick(opts[(i + d2 + opts.length) % opts.length].v);
  };
  paint();
  return wire({ el: d, onLeft: function () { step(-1); }, onRight: function () { step(1); },
    onEnter: function () { step(1); }, onClick: function () {}, repaint: paint });
}

function button(label, note, text, fn) {
  var d = rowShell(label, note);
  d.querySelector('.ctl').innerHTML = '<div class="chip pick"></div>';
  d.querySelector('.chip').textContent = text;
  return wire({ el: d, onEnter: fn });
}

function section(name) {
  var d = document.createElement('div');
  d.className = 'sec';
  d.textContent = name;
  el.setbody.appendChild(d);
}

/* ================================================================
   THE DEVICE PANEL
   ================================================================
   "Auto-scan and show me what is plugged in." A pad is drawn as a pad,
   with the sticks live so you can see the deadzone you just set eat the
   drift; with nothing plugged in it draws the keyboard and mouse,
   because that is also a device and it is also the one being used. */

function padSvg() {
  return `<svg width="150" height="102" viewBox="0 0 150 102" aria-label="controller">
    <g fill="none" stroke="#8a8272" stroke-width="2">
      <path d="M34 26 h82 a26 26 0 0 1 25 33 l-7 26 a15 15 0 0 1-27 4 l-6-13 h-57 l-6 13
               a15 15 0 0 1-27-4 l-7-26 a26 26 0 0 1 25-33 z"/>
      <path d="M38 44 h18 M47 35 v18"/>
      <circle cx="104" cy="36" r="5"/><circle cx="118" cy="47" r="5"/>
      <circle cx="90" cy="47" r="5"/><circle cx="104" cy="58" r="5"/>
      <path d="M45 18 h20 M85 18 h20"/>
    </g>
    <circle class="ls" cx="63" cy="63" r="11" fill="none" stroke="#4a4234" stroke-width="2"/>
    <circle class="rs" cx="97" cy="72" r="11" fill="none" stroke="#4a4234" stroke-width="2"/>
    <circle class="lsd" cx="63" cy="63" r="4.5" fill="#ffd27a"/>
    <circle class="rsd" cx="97" cy="72" r="4.5" fill="#ffd27a"/>
  </svg>`;
}

function kbmSvg() {
  return `<svg width="150" height="102" viewBox="0 0 150 102" aria-label="keyboard and mouse">
    <g fill="none" stroke="#8a8272" stroke-width="2">
      <rect x="6" y="30" width="94" height="52" rx="5"/>
      <path d="M16 42h10M30 42h10M44 42h10M58 42h10M72 42h10M86 42h6
               M16 54h10M30 54h10M44 54h10M58 54h10M72 54h18
               M22 66h56"/>
      <path d="M116 24 a14 14 0 0 1 14 14 v30 a14 14 0 0 1-28 0 v-30 a14 14 0 0 1 14-14 z"/>
      <path d="M116 24 v18 M102 42 h28"/>
    </g>
  </svg>`;
}

function devicePanel() {
  var d = document.createElement('div');
  d.className = 'device';
  var p = SHELL.pad;
  d.innerHTML = (p ? padSvg() : kbmSvg()) + '<div class="dtxt"></div>';
  var t = d.querySelector('.dtxt');
  if (p) {
    var std = p.mapping === 'standard';
    t.innerHTML = '<b>' + (std ? 'Controller ready' : 'Controller: layout not recognised') + '</b>'
      + '<div' + (std ? '' : ' class="warn"') + '></div>'
      + '<small>' + (std
        ? (p.buttons ? p.buttons.length : 0) + ' buttons, ' + (p.axes ? p.axes.length : 0) + ' axes &middot; sticks shown live'
        : 'Movement and the raw buttons work. The right stick and the triggers are left alone rather than guessed at.')
      + '</small>';
    t.querySelector('div').textContent = (p.id || 'gamepad').slice(0, 52);
  } else {
    t.innerHTML = '<b>Keyboard and mouse</b><div>No controller found</div>'
      + '<small>Plug one in and press a button on it &mdash; this panel picks it up on its own.</small>';
  }
  return d;
}

/* Redraws only the two stick dots, sixty times a second, so the panel
   can be live without rebuilding the screen under the player's cursor. */
var liveTick = null;
function startLive(node) {
  stopLive();
  var ls = node.querySelector('.lsd'), rs = node.querySelector('.rsd');
  var was = !!SHELL.pad;
  liveTick = setInterval(function () {
    if (!!SHELL.pad !== was) { paintTab(); return; }     // plugged in or pulled out
    var p = SHELL.pad;
    if (!p || !ls || !rs) return;
    var a = p.axes || [];
    var dz = settings.deadzoneLeft, dzr = settings.deadzoneRight;
    var lx = Math.abs(a[0] || 0) > dz ? a[0] : 0, ly = Math.abs(a[1] || 0) > dz ? a[1] : 0;
    var rx = Math.abs(a[2] || 0) > dzr ? a[2] : 0, ry = Math.abs(a[3] || 0) > dzr ? a[3] : 0;
    ls.setAttribute('cx', 63 + lx * 6); ls.setAttribute('cy', 63 + ly * 6);
    rs.setAttribute('cx', 97 + rx * 6); rs.setAttribute('cy', 72 + ry * 6);
  }, 33);
}
function stopLive() { if (liveTick) { clearInterval(liveTick); liveTick = null; } }

/* ================================================================
   BINDINGS
   ================================================================
   The defaults are the game's own keys, written out so the screen can
   show them and so a rebind has something to fall back to. */

var ACTIONS = [
  { id: 'fwd',    name: 'Move forward', key: 'KeyW',        pad: null },
  { id: 'back',   name: 'Move back',    key: 'KeyS',        pad: null },
  { id: 'left',   name: 'Move left',    key: 'KeyA',        pad: null },
  { id: 'right',  name: 'Move right',   key: 'KeyD',        pad: null },
  { id: 'jump',   name: 'Jump',         key: 'Space',       pad: 0 },
  { id: 'sprint', name: 'Sprint',       key: 'ShiftLeft',   pad: 10 },
  { id: 'slide',  name: 'Slide',        key: 'ControlLeft', pad: 1 },
  { id: 'use',    name: 'Use / buy',    key: 'KeyF',        pad: 1 },
  { id: 'reload', name: 'Reload',       key: 'KeyR',        pad: 2 },
  { id: 'swap',   name: 'Swap weapon',  key: 'KeyQ',        pad: 3 },
  { id: 'knife',  name: 'Knife',        key: 'KeyV',        pad: 5 },
  { id: 'shield', name: 'Shield',       key: 'KeyG',        pad: 10 },
  /* T, and L1. The row said E and L2 and the game read neither -- the
     menu was describing controls nothing implemented. */
  { id: 'nade',   name: 'Grenade',      key: 'KeyT',        pad: 4 },
  { id: 'pause',  name: 'Pause',        key: 'Escape',      pad: 9 },
];

var PAD_NAMES = ['A', 'B', 'X', 'Y', 'LB', 'RB', 'LT', 'RT', 'Back', 'Start',
  'L3', 'R3', 'D-up', 'D-down', 'D-left', 'D-right', 'Guide'];

function keyName(code) {
  if (!code) return '—';
  if (/^Key./.test(code)) return code.slice(3);
  if (/^Digit./.test(code)) return code.slice(5);
  return code.replace('Left', ' L').replace('Right', ' R').replace('Arrow', '');
}
function padName(i) { return i == null ? '—' : (PAD_NAMES[i] || ('Button ' + i)); }

function bindOf(a, which) {
  var m = which === 'pad' ? settings.padBinds : settings.keyBinds;
  if (m && Object.prototype.hasOwnProperty.call(m, a.id)) return m[a.id];
  return which === 'pad' ? a.pad : a.key;
}

function setBind(a, which, v) {
  var k = which === 'pad' ? 'padBinds' : 'keyBinds';
  if (!settings[k]) settings[k] = {};
  settings[k][a.id] = v;
  saveSettings();
  publishBinds();
}

/* The game reads these off BUNKER.binds every frame it cares about, so a
   rebind is live with nothing to restart. */
function publishBinds() {
  var keys = {}, pads = {};
  ACTIONS.forEach(function (a) { keys[a.id] = bindOf(a, 'key'); pads[a.id] = bindOf(a, 'pad'); });
  SHELL.binds = { keys: keys, pad: pads };
  if (W.BUNKER) W.BUNKER.binds = SHELL.binds;
  if (handle && handle.S) handle.S.binds = SHELL.binds;
}

/* Capturing a new binding. One listener, armed for one press, cancelled
   by Escape -- and it has to sit in front of the menu's own handler or
   pressing W to rebind "forward" would just move the cursor down. */
var capturing = null;

function bindRow(a, which) {
  var d = rowShell(a.name, null);
  var ctl = d.querySelector('.ctl');
  ctl.innerHTML = '<div class="chip"></div>';
  var chip = ctl.querySelector('.chip');
  var paint = function () {
    if (capturing === a.id + which) { chip.textContent = which === 'pad' ? 'press a button' : 'press a key'; chip.classList.add('pick'); }
    else { chip.textContent = which === 'pad' ? padName(bindOf(a, 'pad')) : keyName(bindOf(a, 'key')); chip.classList.remove('pick'); }
  };
  var arm = function () {
    capturing = a.id + which;
    paint();
    if (which === 'key') {
      var onKey = function (e) {
        e.preventDefault(); e.stopPropagation();
        W.removeEventListener('keydown', onKey, true);
        capturing = null;
        if (e.code !== 'Escape') setBind(a, 'key', e.code);
        paintTab();
      };
      W.addEventListener('keydown', onKey, true);
    } else {
      var t0 = Date.now();
      var poll = setInterval(function () {
        var p = SHELL.pad;
        if (Date.now() - t0 > 6000) { clearInterval(poll); capturing = null; paintTab(); return; }
        if (!p) return;
        for (var i = 0; i < p.buttons.length; i++) {
          if (p.buttons[i] && (p.buttons[i].pressed || p.buttons[i].value > 0.5)) {
            clearInterval(poll); capturing = null;
            if (i !== 1) setBind(a, 'pad', i);        // B cancels
            paintTab();
            return;
          }
        }
      }, 40);
    }
  };
  paint();
  return wire({ el: d, onEnter: arm });
}

/* ================================================================
   THE TABS
   ================================================================ */

function paintTab(keepPlace) {
  stopLive();
  // The mic meter's nodes belong to the tab that drew them.
  micMeter = null; micGateMark = null;
  /* Rebuilding the tab used to throw you back to the top of it. Rebind a
     key and the whole list jumps, which reads as "nothing happened" even
     when the bind took. Where you were is kept across a rebuild of the
     same tab -- both the selected row and how far the panel is scrolled. */
  var wasAt = nav.i, wasScroll = el.setbody.scrollTop;
  el.setbody.innerHTML = '';
  var rows = [];
  var add = function (r) { if (r) { el.setbody.appendChild(r.el); rows.push(r); } return r; };

  if (curTab === 'controls') {
    var dev = devicePanel();
    el.setbody.appendChild(dev);
    startLive(dev);

    section('Looking');
    add(slider('Mouse sensitivity', 'How far the view turns for the same hand movement.',
      'sensitivity', 0.10, 4.00, 0.05));
    add(slider('Stick sensitivity', 'The right stick, kept separate from the mouse on purpose.',
      'padSensitivity', 0.10, 4.00, 0.05));
    add(slider('Aiming multiplier', 'What is left of your sensitivity while the sights are up.',
      'adsMultiplier', 0.10, 1.50, 0.05));
    add(toggle('Invert vertical', 'Push the stick up to look down.', 'invertY', 'Inverted', 'Normal'));

    section('Keyboard');
    ACTIONS.forEach(function (a) { add(bindRow(a, 'key')); });
    add(button('Reset the keyboard', 'Back to WASD and the rest.', 'Reset', function () {
      settings.keyBinds = null; saveSettings(); publishBinds(); paintTab();
    }));

  } else if (curTab === 'gamepad') {
    var dev2 = devicePanel();
    el.setbody.appendChild(dev2);
    startLive(dev2);

    section('Feel');
    add(slider('Left stick dead zone', 'How far it has to move before the game believes it.',
      'deadzoneLeft', 0, 0.50, 0.01));
    add(slider('Right stick dead zone', 'Raise this if the view drifts when you let go.',
      'deadzoneRight', 0, 0.50, 0.01));
    add(slider('Trigger pull', 'How far a trigger travels before it counts as a press.',
      'triggerThreshold', 0.05, 0.90, 0.05));

    section('Vibration');
    add(toggle('Vibration', 'The pad shakes on a hit, a shot and a hit taken.', 'vibration'));
    add(slider('Strength', null, 'vibrationStrength', 0, 1.50, 0.05));
    add(button('Test it', 'A short pulse, at the strength above.', 'Buzz', function () { rumble(0.35, 0.5); }));

    section('Layout');
    add(choice('Preset', 'Southpaw swaps the sticks. Legacy swaps jump and use.', 'padLayout', [
      { name: 'Standard', v: 'standard' }, { name: 'Southpaw', v: 'southpaw' },
      { name: 'Legacy', v: 'legacy' }, { name: 'Custom', v: 'custom' },
    ]));
    ACTIONS.filter(function (a) { return a.pad != null; }).forEach(function (a) { add(bindRow(a, 'pad')); });
    add(button('Reset the controller', 'Back to the standard layout.', 'Reset', function () {
      settings.padBinds = null; settings.padLayout = 'standard'; saveSettings(); publishBinds(); paintTab();
    }));

  } else if (curTab === 'audio') {
    section('Volume');
    add(slider('Master', null, 'volMaster', 0, 1.00, 0.05));
    add(slider('Effects', null, 'volSfx', 0, 1.00, 0.05));
    add(slider('Voices', null, 'volVoice', 0, 1.00, 0.05));
    add(toggle('Subtitles', 'What they say, written, whether or not it is spoken.', 'subtitles'));

    section('Microphone');
    var note = document.createElement('div');
    note.className = 'row';
    note.innerHTML = '<div class="lbl" style="flex:1">Level<small>Speak and watch it move. '
      + 'The marker is the gate: below it nothing is sent.</small></div>'
      + '<div class="ctl"><div class="meter"><div class="m"></div><div class="gate"></div></div></div>';
    el.setbody.appendChild(note);
    micMeter = note.querySelector('.m');
    micGateMark = note.querySelector('.gate');
    paintGate();

    add(toggle('Microphone', 'Off until you turn it on, and the browser will ask before it opens.',
      'micEnabled', 'On', 'Off'));
    add(slider('Input gain', 'Multiplies what comes in, before the gate.', 'micGain', 0.10, 4.00, 0.05));
    add(slider('Noise gate', 'Anything quieter than this is treated as silence.', 'micGate', 0, 0.40, 0.01));
    add(button('Open the microphone', 'Asks the browser for permission and starts the meter.',
      micStream ? 'Stop' : 'Start', function () { micStream ? stopMic() : startMic(); }));
    var st = document.createElement('div');
    st.className = 'sec';
    st.style.borderBottom = 'none';
    st.textContent = micNote;
    el.setbody.appendChild(st);

  } else if (curTab === 'video') {
    section('Preset');
    add(choice('Quality', 'The game\'s own five, and custom is whatever you set below.', 'graphics', [
      { name: 'Retro', v: 'retro' }, { name: 'Low', v: 'low' }, { name: 'Normal', v: 'normal' },
      { name: 'High', v: 'high' }, { name: 'Ultra', v: 'ultra' }, { name: 'Custom', v: 'custom' },
    ]));
    add(button('Apply the preset', 'Writes the preset into every setting below.', 'Apply', function () {
      applyPreset(settings.graphics); paintTab();
    }));

    section('Custom');
    add(toggle('Shadows', 'The single most expensive thing on this list.', 'gShadows'));
    add(slider('Particles', 'Sparks, dust, blood and brass, as a fraction of full.', 'gParticles', 0, 1.50, 0.05));
    add(toggle('Bloom', 'The glow around lamps and muzzle flash.', 'gBloom'));
    add(toggle('Film grain', null, 'gGrain'));
    add(toggle('Vignette', 'The darkening at the corners of the screen.', 'gVignette'));
    add(slider('Render scale', 'Draw smaller than the window and scale up. The cheapest thing you can change.',
      'gRenderScale', 0.50, 1.00, 0.05));
    add(slider('View distance', 'How far out the battlefield is drawn.', 'gViewDistance', 80, 400, 10));
    add(slider('HUD size', null, 'hudScale', 0.75, 1.40, 0.05));

  } else if (curTab === 'frames') {
    section('Three limits, because they are three different jobs');
    var why = document.createElement('div');
    why.className = 'row';
    why.innerHTML = '<div class="lbl" style="flex:1"><small>A menu has no reason to run a laptop fan at '
      + 'three hundred frames a second. A round should have everything the display will take. '
      + 'A paused game is still drawing the room behind the panel and can afford to be slow. '
      + 'Zero means uncapped.</small></div>';
    el.setbody.appendChild(why);
    add(slider('Menus and lobby', 'In force right now.', 'fpsMenu', 0, 240, 5));
    add(slider('In a round', null, 'fpsGame', 0, 240, 5));
    add(slider('Paused', null, 'fpsPaused', 0, 240, 5));
    var now = document.createElement('div');
    now.className = 'sec';
    now.style.borderBottom = 'none';
    now.textContent = 'in force: ' + (fpsFor() ? fpsFor() + ' fps' : 'uncapped')
      + '  ·  measured: ' + fpsNow.toFixed(0) + ' fps';
    el.setbody.appendChild(now);

  } else if (curTab === 'about') {
    section('Services');
    var svc = document.createElement('div');
    svc.className = 'row';
    svc.innerHTML = '<div class="lbl" style="flex:1"><small>'
      + 'Checked once during loading. Online, the game asks the host it was '
      + 'loaded from whether it is still there, with a two and a half second '
      + 'timeout; offline it does not ask at all and nothing waits. It talks '
      + 'to nobody you did not already load the page from. Takes effect on '
      + 'the next load.</small></div>';
    el.setbody.appendChild(svc);
    add(toggle('Log in to services', 'Off plays entirely offline.', 'online', 'Online', 'Offline'));
    var st2 = document.createElement('div');
    st2.className = 'sec';
    st2.style.borderBottom = 'none';
    st2.textContent = 'last check: ' + ((SHELL.online && SHELL.online.why) || 'not checked');
    el.setbody.appendChild(st2);

    section('Tell the maintainer');
    var box = document.createElement('div');
    box.className = 'row';
    box.style.display = 'block';
    box.innerHTML = '<div class="lbl" style="flex:1;margin-bottom:8px">What went wrong, or what you want'
      + '<small>Sent with the build stamp, your settings and what hardware the browser admits to. '
      + 'Nothing else, and nothing without you pressing send.</small></div>'
      + '<textarea placeholder="It happened when I..."></textarea>';
    el.setbody.appendChild(box);
    var ta = box.querySelector('textarea');
    add(button('Send it', 'Opens a report addressed to the maintainer, filled in.', 'Send', function () {
      sendFeedback(ta.value);
    }));
    add(button('Copy it instead', 'Puts the whole report on the clipboard.', 'Copy', function () {
      copyFeedback(ta.value);
    }));
    var out = document.createElement('div');
    out.className = 'sec';
    out.style.borderBottom = 'none';
    out.id = 'b9sent';
    out.textContent = feedbackNote;
    el.setbody.appendChild(out);

    section('This build');
    var info = document.createElement('div');
    info.className = 'row';
    info.innerHTML = '<div class="lbl" style="flex:1"><small>' + buildLine().replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</small></div>';
    el.setbody.appendChild(info);
  }

  navSet(rows, closeSettings, keepPlace !== false);
  if (keepPlace !== false) {
    if (wasAt < nav.rows.length) { nav.i = wasAt; navPaint(false); }
    el.setbody.scrollTop = wasScroll;
  }
}

function applyPreset(name) {
  if (name === 'custom') return;           // custom means leave everything alone
  /* The presets belong to the game, not to this screen. Handing the name
     straight to applyGraphics means the menu can never drift from what
     the presets actually do -- and then the rows below are refilled from
     what the renderer ended up with, so "Custom" starts from the truth
     rather than from a copy of it that was right once. */
  if (handle && handle.game && W.BUNKER && W.BUNKER.applyGraphics) {
    try { W.BUNKER.applyGraphics(handle.game, handle.S, name); } catch (e) { /* unknown preset */ }
    var q = handle.game.renderer && handle.game.renderer.quality;
    if (q) {
      if (q.shadows != null) settings.gShadows = !!q.shadows;
      if (q.renderScale != null) settings.gRenderScale = q.renderScale;
      if (q.bloom != null) settings.gBloom = !!q.bloom;
    }
    if (handle.S && handle.S.particleScale != null) settings.gParticles = handle.S.particleScale;
  }
  var far = { retro: 110, low: 130, normal: 220, high: 300, ultra: 400 }[name];
  if (far) settings.gViewDistance = far;
  saveSettings();
}

/* A short pulse on whichever rumble interface the pad exposes. Chrome
   uses vibrationActuator, Firefox uses hapticActuators; a pad with
   neither simply does nothing, which is the correct behaviour. */
function rumble(strong, seconds) {
  if (!settings.vibration) return;
  var p = SHELL.pad;
  if (!p) return;
  var m = Math.max(0, Math.min(1, strong * settings.vibrationStrength));
  try {
    if (p.vibrationActuator && p.vibrationActuator.playEffect) {
      p.vibrationActuator.playEffect('dual-rumble', {
        duration: (seconds || 0.3) * 1000, strongMagnitude: m, weakMagnitude: m * 0.6,
      });
    } else if (p.hapticActuators && p.hapticActuators[0]) {
      p.hapticActuators[0].pulse(m, (seconds || 0.3) * 1000);
    }
  } catch (e) { /* the pad refused; not worth telling anyone about */ }
}
SHELL.rumble = rumble;

/* ================================================================
   MICROPHONE
   ================================================================
   Not used by anything yet -- there is no voice chat to feed. It is here
   because the level has to be set BEFORE the first time it matters, and
   because a microphone you cannot see the level of is a microphone
   nobody trusts. Opened only when asked, closed when the screen closes,
   and the browser asks first. */

var micStream = null, micNode = null, micData = null, micMeter = null, micGateMark = null, micRaf = 0;
var micNote = 'not open';

function paintGate() {
  if (micGateMark) micGateMark.style.left = (settings.micGate * 100) + '%';
}

function startMic() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    micNote = 'this browser will not open a microphone';
    paintTab(); return;
  }
  if (!audioCtx) { micNote = 'no audio device'; paintTab(); return; }
  micNote = 'asking for permission…';
  paintTab();
  navigator.mediaDevices.getUserMedia({ audio: {
    echoCancellation: true, noiseSuppression: true, autoGainControl: false,
    deviceId: settings.micDevice ? { exact: settings.micDevice } : undefined,
  } }).then(function (s) {
    micStream = s;
    settings.micEnabled = true; saveSettings();
    var src = audioCtx.createMediaStreamSource(s);
    var an = audioCtx.createAnalyser();
    an.fftSize = 1024;
    an.smoothingTimeConstant = 0.6;
    src.connect(an);
    micNode = an;
    micData = new Uint8Array(an.fftSize);
    var name = (s.getAudioTracks()[0] || {}).label || 'microphone';
    micNote = 'open: ' + name;
    paintTab();
    pumpMic();
  }).catch(function (err) {
    micNote = 'refused: ' + (err && err.name ? err.name : 'unknown');
    settings.micEnabled = false; saveSettings();
    paintTab();
  });
}

function stopMic() {
  if (micRaf) { cancelAnimationFrame(micRaf); micRaf = 0; }
  if (micStream) { micStream.getTracks().forEach(function (t) { t.stop(); }); micStream = null; }
  micNode = null; micData = null;
  micNote = 'closed';
}

/* Root mean square of the window, which is loudness rather than the peak
   of one sample -- a meter driven by the peak jumps on every click and
   tells you nothing about whether you can be heard. */
function pumpMic() {
  if (!micNode || !micData) return;
  micNode.getByteTimeDomainData(micData);
  var sum = 0, i;
  for (i = 0; i < micData.length; i++) {
    var v = (micData[i] - 128) / 128;
    sum += v * v;
  }
  var rms = Math.sqrt(sum / micData.length) * settings.micGain;
  SHELL.micLevel = rms;
  if (micMeter) {
    var shown = Math.min(1, rms * 3);
    micMeter.style.width = (shown * 100) + '%';
    micMeter.style.background = rms < settings.micGate ? '#4a4234' : (rms > 0.55 ? '#ff6a5a' : '#8ce8a0');
  }
  micRaf = requestAnimationFrame(pumpMic);
}

/* ================================================================
   FEEDBACK
   ================================================================
   There is no server behind this game, so "reports to the maintainer"
   has to mean something a static page can actually do. It opens a new
   issue on the repository this build came from, with the message and
   the diagnostics already filled in, and it puts the same text on the
   clipboard so nothing is lost if the tab is blocked. It says which of
   those happened rather than flashing "sent!" and hoping. */

var REPO = 'dax-code-bro/Untitled-new-game-project';
var feedbackNote = '';

function buildLine() {
  var b = document.getElementById('build');
  var stamp = b ? (b.textContent || '').trim() : 'unknown build';
  var g = handle && handle.game;
  return [
    stamp,
    'page: ' + location.href.split('?')[0],
    'screen: ' + (W.innerWidth | 0) + '×' + (W.innerHeight | 0) + ' @' + (W.devicePixelRatio || 1),
    'renderer: ' + rendererName(g),
    'pad: ' + (SHELL.pad ? (SHELL.pad.id || 'yes') + (SHELL.pad.mapping === 'standard' ? ' (standard)' : ' (non-standard)') : 'none'),
    'boot: ' + ((SHELL.buildMs || 0) / 1000).toFixed(1) + ' s, body model '
      + (SHELL.walkerLoaded ? 'loaded' : 'missing'),
    'agent: ' + navigator.userAgent,
  ].join('\n');
}

function rendererName(g) {
  try {
    var gl = g && g.renderer && g.renderer.gl;
    if (!gl) return 'not started';
    var ext = gl.getExtension('WEBGL_debug_renderer_info');
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : (gl.getParameter(gl.RENDERER) || 'webgl2');
  } catch (e) { return 'unavailable'; }
}

function report(msg) {
  return (msg || '(no message)') + '\n\n---\n' + buildLine()
    + '\n\nsettings:\n' + JSON.stringify(settings, null, 1);
}

function sendFeedback(msg) {
  var text = report(msg);
  var title = (msg || '').trim().split('\n')[0].slice(0, 70) || 'Feedback from the game';
  var url = 'https://github.com/' + REPO + '/issues/new?title='
    + encodeURIComponent(title) + '&body=' + encodeURIComponent(text);
  copyText(text);
  var win = W.open(url, '_blank', 'noopener');
  feedbackNote = win
    ? 'opened a report on the repository, and copied it as well'
    : 'the tab was blocked — the whole report is on your clipboard, paste it anywhere';
  paintTab();
}

function copyFeedback(msg) {
  copyText(report(msg));
  feedbackNote = 'copied to the clipboard';
  paintTab();
}

function copyText(t) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t); return; }
  } catch (e) { /* fall through */ }
  try {
    var ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy');
    document.body.removeChild(ta);
  } catch (e2) { /* nothing else to try */ }
}

/* ================================================================
   FRAME COUNTER
   ================================================================
   Measured, not asked for: the frame-limit screen is the one place a
   number is worth more than a setting. */
var fpsNow = 0, fpsAcc = 0, fpsN = 0, fpsT = 0;
(function tickFps(t) {
  if (fpsT) {
    var dt = t - fpsT;
    if (dt > 0 && dt < 500) { fpsAcc += dt; fpsN++; }
    if (fpsAcc > 400) { fpsNow = 1000 / (fpsAcc / fpsN); fpsAcc = 0; fpsN = 0; }
  }
  fpsT = t;
  requestAnimationFrame(tickFps);
})(0);

/* ================================================================
   PAUSE
   ================================================================
   Escape or Start, in a round. It shows the three things you actually
   want when you stop: how everyone is doing, what each gun has done for
   you, and the way out.

   Pausing is real: the game's clock stops, the pointer is released, and
   the frame limit drops to the paused figure. */

var paused = false;
var pauseGuard = false;

function installPause() {
  if (pauseGuard) return;
  pauseGuard = true;
  W.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (root && !root.classList.contains('gone') && !el.pause.classList.contains('on')) return;
    if (!handle) return;
    e.preventDefault();
    e.stopPropagation();
    paused ? resume() : openPause();
  }, true);
  startHook = function () { if (handle) (paused ? resume() : openPause()); };
}

function openPause() {
  if (!handle) return;
  paused = true;
  setPhase('paused');
  try { if (document.exitPointerLock) document.exitPointerLock(); } catch (e) { /* not locked */ }
  /* The engine's loop already checks a `paused` flag before it steps, so
     pausing is setting it. Nothing else stops: the renderer keeps drawing
     the room behind the panel, which is why there is a separate frame cap
     for being paused. */
  if (handle.game) handle.game.paused = true;
  show('pause');
  paintPause();
  startHook = function () { resume(); };
}

function resume() {
  paused = false;
  setPhase('game');
  hideAll();
  navClear();
  if (handle.game) handle.game.paused = false;
  var c = document.querySelector('#game');
  if (c && c.requestPointerLock) { try { c.requestPointerLock(); } catch (e) { /* refused */ } }
  startHook = function () { openPause(); };
}

/* Everything the scoreboard shows, read off the game. Anything the game
   does not track yet comes back as a dash rather than a zero -- a zero
   is a claim that it happened none of the times, and a dash is the
   truth, which is that nobody counted. */
function statsOf() {
  var S = handle && handle.S, P = handle && handle.P;
  var st = (S && S.stats) || {};
  return {
    name: (S && S.hero && S.hero().name) || 'You',
    points: S ? S.points : 0,
    round: S ? S.round : 0,
    kills: st.kills != null ? st.kills : (S ? S.killsTotal : null),
    headshots: st.headshots != null ? st.headshots : null,
    shots: st.shots != null ? st.shots : null,
    downs: P && P.downs != null ? P.downs : null,
    revives: st.revives != null ? st.revives : null,
    perks: (P && P.perks) ? Object.keys(P.perks).filter(function (k) { return P.perks[k]; }) : [],
    byWeapon: st.byWeapon || {},
  };
}

function num(v) { return v == null ? '—' : String(v); }

function paintPause() {
  var s = statsOf();
  el.prd.textContent = s.round || 1;
  var perkColor = { supersoldier: '#ff6a3a', deflect: '#66d4ff', shieldup: '#b08cff', adrenaline: '#ffd23a' };

  var dots = s.perks.length
    ? '<span class="perkdots">' + s.perks.map(function (p) {
        return '<span class="pd" style="background:' + (perkColor[p] || '#8a8272') + '" title="' + p + '"></span>';
      }).join('') + '</span>'
    : '—';

  var acc = (s.shots && s.kills != null) ? Math.round((s.kills / s.shots) * 100) + '%' : '—';

  var html = '<table><thead><tr>'
    + '<th>Who</th><th>Points</th><th>Kills</th><th>Heads</th><th>Shots</th>'
    + '<th>Kills / shot</th><th>Downs</th><th>Revives</th><th>Perks</th>'
    + '</tr></thead><tbody><tr class="me">'
    + '<td>' + esc(s.name) + '</td><td>' + num(s.points) + '</td><td>' + num(s.kills) + '</td>'
    + '<td>' + num(s.headshots) + '</td><td>' + num(s.shots) + '</td><td>' + acc + '</td>'
    + '<td>' + num(s.downs) + '</td><td>' + num(s.revives) + '</td><td>' + dots + '</td>'
    + '</tr></tbody></table>';

  /* Weapons. Every gun the player has actually fired, most-used first,
     with the kills it has to its name. */
  var ws = [];
  for (var id in s.byWeapon) {
    var w = s.byWeapon[id];
    ws.push({ id: id, name: weaponName(id), kills: w.kills || 0, shots: w.shots || 0, heads: w.headshots || 0 });
  }
  ws.sort(function (a, b) { return b.kills - a.kills || b.shots - a.shots; });
  html += '<div class="sec">Weapons</div>';
  html += ws.length
    ? '<div class="gunlist">' + ws.map(function (w) {
        return '<div class="gun"><span class="n">' + esc(w.name) + '</span>'
          + '<span class="k">' + w.kills + ' <small>kills · ' + w.shots + ' shots · '
          + w.heads + ' heads</small></span></div>';
      }).join('') + '</div>'
    : '<div class="gun"><span class="n">Nothing fired yet</span><span class="k">—</span></div>';

  el.pbody.innerHTML = html;

  el.pauseacts.innerHTML = '';
  var rows = [];
  var mk = function (t, h, fn) {
    var d = mkItem(t, h);
    el.pauseacts.appendChild(d);
    rows.push(wire({ el: d, onEnter: fn }));
  };
  mk('Resume', 'back to it', resume);
  mk('Settings', 'they take effect at once', function () { openSettings('pause'); });
  mk('Save and quit', 'to the main menu', saveAndQuit);
  navSet(rows, resume);
}

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function weaponName(id) {
  try {
    var W2 = W.BUNKER && W.BUNKER.WEAPONS;
    if (W2 && W2[id] && W2[id].name) return W2[id].name;
  } catch (e) { /* fall through to the id */ }
  return id;
}

/* ================================================================
   SAVES
   ================================================================
   "Saves that transfer over to updates." That is a promise about the
   FORMAT, not about the code: a save is a flat, named, versioned record
   of what the player had -- round, points, guns, perks, tallies -- and
   loading it fills in what this build understands and ignores what it
   does not. Nothing in it is a pointer into this build's data, so a
   build that renames an internal thing does not orphan the file. */

var SAVE_KEY = 'b9.save.v1';

function saveAndQuit() {
  var S = handle && handle.S, P = handle && handle.P;
  var s = statsOf();
  var save = {
    v: 1,
    at: new Date().toISOString(),
    build: (document.getElementById('build') || {}).textContent || '',
    hero: S ? S.heroId : null,
    round: S ? S.round : 0,
    points: S ? S.points : 0,
    perks: s.perks,
    stats: { kills: s.kills, headshots: s.headshots, shots: s.shots, downs: s.downs,
      revives: s.revives, byWeapon: s.byWeapon },
    /* P.slots is a list of weapon ids; the magazine and the reserve live
       in P.ammo keyed by the same id, and the fitted attachments in
       P.parts. Written out by name so a build that reorders its slots or
       renames a field internally can still read this back. */
    weapons: (P && P.slots ? P.slots : []).map(function (id) {
      var am = (P.ammo && P.ammo[id]) || {};
      return { id: id, mag: am.mag == null ? null : am.mag,
        reserve: am.reserve == null ? null : am.reserve,
        parts: (P.parts && P.parts[id]) ? P.parts[id] : null };
    }),
    slot: P ? P.slot : 0,
  };
  try { W.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage off */ }
  SHELL.lastSave = save;
  paused = false;
  /* Quitting to the menu means the round is over as far as the game is
     concerned. Reloading is the honest way to get a clean bunker without
     pretending this build can tear one down and build another. */
  location.reload();
}

SHELL.readSave = function () {
  try {
    var raw = W.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    var s = JSON.parse(raw);
    return (s && s.v === 1) ? s : null;
  } catch (e) { return null; }
};

/* ================================================================
   WIRING
   ================================================================ */

loadSettings();
publishBinds();
SHELL.online = { ok: false, why: 'not checked' };
SHELL.walkerLoaded = false;
SHELL.buildMs = 0;
SHELL.micLevel = 0;
SHELL.pad = null;
SHELL.binds = SHELL.binds || null;
SHELL.applySettings = applySettings;
SHELL.openSettings = function () { if (root) openSettings(paused ? 'pause' : 'main'); };
SHELL.openPause = openPause;
SHELL.resume = resume;
SHELL.handle = function () { return handle; };
SHELL.beep = beep;

W.BUNKER_SHELL = SHELL;

})();
