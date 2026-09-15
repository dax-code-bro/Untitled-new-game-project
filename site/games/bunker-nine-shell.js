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

/* Which map this page was BUILT with, as opposed to which one is
   selected in the menu. They are the same until you pick the other one,
   and then the page reloads and they are the same again. Read once, here,
   before anything else looks at it -- the boot sequence needs it and so
   does the map screen, and neither should be reading storage itself. */
var MAP_KEY = 'b9.map', MAP_RESUME = 'b9.map.resume';
var bootMap = 'bunker9', resumeMaps = false;
try {
  var savedMap = W.localStorage.getItem(MAP_KEY);
  if (savedMap) bootMap = savedMap;
  resumeMaps = W.localStorage.getItem(MAP_RESUME) === '1';
  if (resumeMaps) W.localStorage.removeItem(MAP_RESUME);
} catch (e) { /* storage off; the bunker it is */ }
SHELL.bootMap = bootMap;
SHELL.map = bootMap;

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

/* ---- map select ----

   The shape the console zombies map screens use, and for the reason they
   use it: a list of maps you move down, and one big panel that changes as
   you move. Reading a name tells you nothing about a map; a picture of it
   does, so the picture is the biggest thing on the screen and the list is
   a column beside it.

   The preview is a stack of images, all loaded, all absolutely on top of
   each other, and only one carrying the 'on' class. Cross-fading is
   then a class toggle and a CSS transition rather than anything that
   has to run every frame -- which matters, because this screen sits in
   front of a WebGL context still holding a whole bunker in memory.

   And no backtick may appear anywhere in this string. It is a template
   literal, so one ends it -- which is how a comment about a CSS class
   took the entire shell off the air: a quoted class name in prose
   closed CSS2, the
   rest of the stylesheet parsed as JavaScript, and BUNKER_SHELL never
   got defined. It still passed a syntax check, because a tagged
   template is valid JavaScript. Only loading the page found it. */
#b9shell .maps { background:linear-gradient(180deg,#07080c 0%,#0b0a08 55%,#05060a 100%); }
#b9shell .mapwrap { width:min(1120px,92vw); display:flex; gap:34px; align-items:stretch; }
#b9shell .maphead { width:min(1120px,92vw); margin-bottom:20px; display:flex; align-items:baseline; gap:18px; }
#b9shell .maphead h2 { margin:0; font-size:26px; font-weight:normal; letter-spacing:.30em; color:#e8ddc8; }
#b9shell .maphead .sub { font-size:11.5px; letter-spacing:.28em; color:#6b6455; text-transform:uppercase; }
#b9shell .maplist { flex:0 0 300px; display:flex; flex-direction:column; gap:3px; }
#b9shell .mapitem { padding:15px 18px; border:1px solid transparent; background:rgba(232,221,200,.03);
  cursor:pointer; }
#b9shell .mapitem .nm { font-size:19px; letter-spacing:.20em; text-transform:uppercase; }
#b9shell .mapitem .st { font-size:10.5px; letter-spacing:.22em; text-transform:uppercase; color:#6b6455;
  margin-top:5px; }
#b9shell .mapitem.sel { border-color:#ffd27a; background:rgba(255,210,122,.10); }
#b9shell .mapitem.sel .nm { color:#ffd27a; }
#b9shell .mapitem.off .nm { color:#5d5749; }
#b9shell .mapitem.off .st { color:#7a3d38; }

#b9shell .mappanel { flex:1; display:flex; flex-direction:column; min-width:0; }
/* 16:9, because every picture in it is a screenshot of the game. */
#b9shell .mapshot { position:relative; width:100%; aspect-ratio:16/9; background:#0a0b0e;
  border:1px solid #4a4234; overflow:hidden; }
#b9shell .mapshot img, #b9shell .mapshot .ph { position:absolute; inset:0; width:100%; height:100%;
  object-fit:cover; opacity:0; transition:opacity 1.1s ease; }
#b9shell .mapshot img.on, #b9shell .mapshot .ph.on { opacity:1; }
/* Nothing to show yet: a plate rather than a broken image. */
#b9shell .mapshot .ph { display:flex; align-items:center; justify-content:center; text-align:center;
  color:#4a4438; font-size:12px; letter-spacing:.30em; text-transform:uppercase;
  background:repeating-linear-gradient(135deg,#0c0d10 0 14px,#0a0b0e 14px 28px); }
/* A row of ticks under the picture: which of the shots you are looking at. */
#b9shell .mapdots { display:flex; gap:5px; margin-top:9px; height:2px; }
#b9shell .mapdots i { flex:1; background:rgba(232,221,200,.14); transition:background .4s ease; }
#b9shell .mapdots i.on { background:#ffd27a; }
#b9shell .mapdesc { margin-top:13px; font-size:13.5px; line-height:1.65; color:#8a8272;
  font-style:italic; letter-spacing:.02em; min-height:44px; }
#b9shell .mapmeta { margin-top:10px; display:flex; gap:26px; font-size:11px; letter-spacing:.22em;
  text-transform:uppercase; color:#6b6455; }
#b9shell .mapmeta b { color:#a89b80; font-weight:normal; }
@media (max-width: 780px) {
  #b9shell .mapwrap { flex-direction:column; gap:18px; }
  #b9shell .maplist { flex:none; }
}

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

var CSS3 = `
/* ================================================================
   MULTIPLAYER -- THE LOOK
   ================================================================
   Two screens behind two tabs, and a third thing that is neither: the
   operator, training, behind both of them.

   THE TRAINING ANIMATION

   The lobby background is the character you picked, on a range, running
   a drill. It is an SVG built the same way the loading zombie is --
   one group per bone, each rotating about its own joint, every bone
   drawn straight down from its own origin so a child group translated
   to the end of it is the next joint for free.

   It is a drill and not a pose because a pose tells you nothing about
   a menu you are going to sit in for two minutes. Twelve seconds, and
   in that time the operator brings the rifle up, fires three, drops the
   magazine, puts a fresh one in, works the bolt and goes back to the
   ready. Everything on that clock is a real step -- the bolt goes back
   BEFORE the magazine is out, the hand comes off the grip to do it, and
   the gun stays pointed down range the whole time, because that is how
   it is actually done and getting it wrong is the kind of thing this
   game is being built not to get wrong.

   The same compositor rule as the loading screen: transforms and
   opacity only. The lobby sits in front of a live WebGL context with a
   whole map in it and this must not cost a frame.
   ================================================================ */

#b9shell .mp { background:linear-gradient(180deg,#07080c 0%,#0b0a08 55%,#05060a 100%);
  align-items:stretch; justify-content:flex-start; }

/* ---- the range, behind everything ---- */
#b9shell .train { position:absolute; inset:0; overflow:hidden; pointer-events:none; }
#b9shell .train svg { position:absolute; right:2vw; bottom:0; height:min(72vh,660px); width:auto;
  opacity:.5; transition:opacity .5s ease; }
/* The loadout is a screen of small italic text and the operator is
   standing behind it. On that tab he drops back to where he reads as
   light on a wall rather than as something between you and a word. */
#b9shell .mp.deep .train svg { opacity:.16; }
#b9shell .train .vig { position:absolute; inset:0;
  background:radial-gradient(120% 90% at 74% 72%, rgba(0,0,0,0) 0%, rgba(5,6,10,.55) 46%, rgba(5,6,10,.93) 100%); }
#b9shell .train .bone { stroke:#cdc4b0; stroke-linecap:round; fill:none; }
#b9shell .train .far { opacity:.36; }
#b9shell .train .skin { fill:#cdc4b0; }
#b9shell .train .cloth { stroke:#6f6a58; stroke-linecap:round; fill:none; }
#b9shell .train .steel { stroke:#8d9198; stroke-linecap:square; fill:none; }
#b9shell .train .wood { stroke:#7a5c3c; stroke-linecap:round; fill:none; }
#b9shell .train .board { stroke:#3a3428; fill:#12130f; }
#b9shell .train .ring { stroke:#4a4234; fill:none; }

/* The clock. Every group below is on the same twelve seconds, so the
   phases line up without a single number having to be computed. */
#b9shell .train .rig      { animation:b9tRig 12s cubic-bezier(.4,0,.3,1) infinite; }
#b9shell .train .armFront { animation:b9tFront 12s cubic-bezier(.4,0,.3,1) infinite; }
#b9shell .train .armBack  { animation:b9tBack 12s cubic-bezier(.4,0,.3,1) infinite; }
#b9shell .train .torso    { animation:b9tTorso 12s ease-in-out infinite; }
#b9shell .train .head     { animation:b9tHead 12s ease-in-out infinite; }
#b9shell .train .flash    { animation:b9tFlash 12s linear infinite; opacity:0; }
#b9shell .train .brass    { animation:b9tBrass 12s linear infinite; opacity:0; }
#b9shell .train .magOut   { animation:b9tMag 12s linear infinite; opacity:0; }
#b9shell .train .breathe  { animation:b9tBreathe 4.2s ease-in-out infinite; }

/* 0-14%   at the ready, gun across the chest
   14-22%  up into the shoulder
   22-36%  three shots, eight frames apart, the gun rocking back each time
   36-44%  down off the shoulder, muzzle still down range
   44-56%  bolt back, hand off the grip
   56-68%  magazine out and away
   68-80%  fresh magazine in
   80-88%  bolt forward
   88-100% back up to the ready */
@keyframes b9tRig {
  0%,13%   { transform:translate(-8px,16px) rotate(27deg); }
  22%      { transform:translate(-4px,-10px) rotate(-1deg); }
  23%      { transform:translate(5px,-8px) rotate(-6deg); }
  25.5%    { transform:translate(-4px,-10px) rotate(-1deg); }
  27%      { transform:translate(5px,-8px) rotate(-6.5deg); }
  29.5%    { transform:translate(-4px,-10px) rotate(-1deg); }
  31%      { transform:translate(5px,-8px) rotate(-6deg); }
  33.5%,35%{ transform:translate(-4px,-10px) rotate(-1deg); }
  44%,79%  { transform:translate(-10px,8px) rotate(19deg); }
  88%,100% { transform:translate(-8px,16px) rotate(27deg); }
}
@keyframes b9tFront {
  0%,13%   { transform:rotate(-54deg); }
  22%,43%  { transform:rotate(-78deg); }
  50%,55%  { transform:rotate(-30deg); }
  62%,67%  { transform:rotate(-14deg); }
  74%,79%  { transform:rotate(-40deg); }
  86%,100% { transform:rotate(-54deg); }
}
@keyframes b9tBack {
  0%,13%   { transform:rotate(-62deg); }
  22%,43%  { transform:rotate(-70deg); }
  56%,79%  { transform:rotate(-66deg); }
  88%,100% { transform:rotate(-62deg); }
}
@keyframes b9tTorso {
  0%,12%   { transform:rotate(0deg); }
  22%,42%  { transform:rotate(-4deg); }
  56%,78%  { transform:rotate(3deg); }
  90%,100% { transform:rotate(0deg); }
}
@keyframes b9tHead {
  0%,12%   { transform:rotate(3deg); }
  22%,42%  { transform:rotate(-6deg); }
  58%,76%  { transform:rotate(10deg); }
  90%,100% { transform:rotate(3deg); }
}
/* Three flashes, one frame each, on the three shot beats. */
@keyframes b9tFlash {
  0%,22.6%   { opacity:0; }
  23%        { opacity:1; }
  23.6%,26.6%{ opacity:0; }
  27%        { opacity:1; }
  27.6%,30.6%{ opacity:0; }
  31%        { opacity:1; }
  31.6%,100% { opacity:0; }
}
/* Brass, thrown up and to the right and falling out of frame. Three
   cases on one element, because it is the same arc three times. */
@keyframes b9tBrass {
  0%,22.9%  { opacity:0; transform:translate(0,0) rotate(0deg); }
  23%       { opacity:1; transform:translate(0,0) rotate(0deg); }
  25.5%     { opacity:0; transform:translate(46px,58px) rotate(320deg); }
  26.9%     { opacity:0; transform:translate(0,0) rotate(0deg); }
  27%       { opacity:1; transform:translate(0,0) rotate(0deg); }
  29.5%     { opacity:0; transform:translate(44px,60px) rotate(300deg); }
  30.9%     { opacity:0; transform:translate(0,0) rotate(0deg); }
  31%       { opacity:1; transform:translate(0,0) rotate(0deg); }
  33.5%     { opacity:0; transform:translate(48px,56px) rotate(340deg); }
  34%,100%  { opacity:0; transform:translate(0,0) rotate(0deg); }
}
/* The empty magazine, dropped at 60% and gone by 66%. */
@keyframes b9tMag {
  0%,59.9% { opacity:0; transform:translate(0,0) rotate(0deg); }
  60%      { opacity:1; transform:translate(0,0) rotate(0deg); }
  67%      { opacity:0; transform:translate(6px,90px) rotate(38deg); }
  68%,100% { opacity:0; transform:translate(0,0) rotate(0deg); }
}
@keyframes b9tBreathe { 0%,100% { transform:translateY(0); } 50% { transform:translateY(-2px); } }
@media (prefers-reduced-motion: reduce) {
  #b9shell .train svg * { animation:none !important; }
}

/* ---- tabs across the top ---- */
#b9shell .mphead { position:relative; z-index:2; width:min(1240px,94vw); margin:0 auto;
  padding-top:min(5vh,44px); display:flex; align-items:baseline; gap:26px; }
#b9shell .mptabs { display:flex; gap:26px; }
#b9shell .mptab { font-size:19px; letter-spacing:.30em; text-transform:uppercase; color:#5d5749;
  cursor:pointer; padding-bottom:7px; border-bottom:2px solid transparent; }
#b9shell .mptab.sel { color:#ffd27a; border-bottom-color:#ffd27a; }
#b9shell .mphead .sp { flex:1; }
#b9shell .mphead .who { font-size:11.5px; letter-spacing:.24em; text-transform:uppercase;
  color:#6b6455; text-align:right; line-height:1.7; }
#b9shell .mphead .who b { color:#a89b80; font-weight:normal; display:block; font-size:14px;
  letter-spacing:.20em; }

#b9shell .mpbody { position:relative; z-index:2; width:min(1240px,94vw); margin:18px auto 0;
  flex:1; min-height:0; display:flex; }
#b9shell .mppane { display:none; flex:1; min-height:0; gap:30px; }
#b9shell .mppane.on { display:flex; }
#b9shell .mpfoot { position:relative; z-index:2; width:min(1240px,94vw); margin:0 auto;
  padding:14px 0 min(4vh,30px); font-size:11.5px; letter-spacing:.20em; color:#5d5749;
  text-transform:uppercase; }
#b9shell .mpfoot b { color:#8a8272; font-weight:normal; }

/* ---- lobby ---- */
#b9shell .lobcol { flex:0 0 330px; display:flex; flex-direction:column; gap:16px; min-height:0; }
#b9shell .lobside { flex:1; display:flex; flex-direction:column; gap:16px; min-width:0;
  max-width:420px; }
#b9shell .card { border:1px solid #37312790; background:rgba(9,8,6,.72); padding:13px 15px; }
#b9shell .card h3 { margin:0 0 9px; font-size:10.5px; letter-spacing:.30em; color:#6b6455;
  text-transform:uppercase; font-weight:normal; }
#b9shell .pick { padding:11px 14px; border:1px solid transparent; background:rgba(232,221,200,.03);
  cursor:pointer; margin-bottom:2px; }
#b9shell .pick .nm { font-size:16px; letter-spacing:.18em; text-transform:uppercase; }
#b9shell .pick .sub { font-size:11px; letter-spacing:.14em; color:#6b6455; margin-top:4px;
  font-style:italic; text-transform:none; }
#b9shell .pick.sel { border-color:#ffd27a; background:rgba(255,210,122,.10); }
#b9shell .pick.sel .nm { color:#ffd27a; }
#b9shell .pick.on .nm:after { content:" \\2713"; color:#8ce8a0; }

/* The two sides of the lobby. Bots are marked, because a lobby that
   hides which of the twelve are people is a lobby that lies to you. */
#b9shell .roster { display:flex; gap:14px; }
#b9shell .team { flex:1; min-width:0; }
#b9shell .team .tn { font-size:10.5px; letter-spacing:.26em; text-transform:uppercase;
  color:#6b6455; margin-bottom:7px; }
#b9shell .team.us .tn { color:#8ce8a0; }
#b9shell .team.them .tn { color:#d2705f; }
#b9shell .slotline { display:flex; justify-content:space-between; gap:8px; font-size:12.5px;
  padding:4px 0; border-bottom:1px solid #1b1813; }
#b9shell .slotline .bot { font-size:9.5px; letter-spacing:.20em; color:#5d5749; }
#b9shell .slotline.me { color:#ffd27a; }
#b9shell .go { display:block; width:100%; text-align:center; padding:15px 0; font-size:19px;
  letter-spacing:.28em; text-transform:uppercase; border:1px solid #4a4234;
  background:rgba(232,221,200,.03); cursor:pointer; }
#b9shell .go.sel { border-color:#ffd27a; color:#ffd27a; background:rgba(255,210,122,.12); }

/* ---- loadout ---- */
#b9shell .slots { flex:0 0 330px; display:flex; flex-direction:column; gap:2px;
  overflow-y:auto; padding-right:4px; }
#b9shell .slots::-webkit-scrollbar { width:8px; }
#b9shell .slots::-webkit-scrollbar-thumb { background:#3a3428; }
#b9shell .lslot { display:flex; align-items:center; gap:12px; padding:10px 14px;
  border:1px solid transparent; background:rgba(232,221,200,.03); cursor:pointer; }
#b9shell .lslot .k { flex:0 0 96px; font-size:9.5px; letter-spacing:.22em; color:#6b6455;
  text-transform:uppercase; }
#b9shell .lslot .v { flex:1; font-size:15px; letter-spacing:.10em; min-width:0;
  overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
#b9shell .lslot .lv { font-size:10.5px; letter-spacing:.14em; color:#6b6455; }
#b9shell .lslot.sel { border-color:#ffd27a; background:rgba(255,210,122,.10); }
#b9shell .lslot.sel .v { color:#ffd27a; }
#b9shell .lslot.head { background:none; cursor:default; padding:14px 14px 5px 0; }
#b9shell .lslot.head .k { flex:1; letter-spacing:.30em; border-bottom:1px solid #2a251d;
  padding-bottom:5px; }

#b9shell .detail { flex:1; min-width:0; display:flex; flex-direction:column; min-height:0; }
#b9shell .dhead { display:flex; align-items:baseline; gap:14px; padding-bottom:9px;
  border-bottom:1px solid #37312790; }
#b9shell .dhead h3 { margin:0; font-size:21px; font-weight:normal; letter-spacing:.20em;
  text-transform:uppercase; }
#b9shell .dhead .tagline { font-size:11px; letter-spacing:.20em; color:#6b6455;
  text-transform:uppercase; }
/* The level bar and what it is counting towards. It was inside the
   header with margin-left:auto, which put a progress bar and two
   sentences on the same line as the gun's name -- and at any width
   narrower than enormous the two sentences ran into each other with no
   space between them. It gets its own line. */
#b9shell .detail > .pg:not(:empty) { margin-top:9px; }
#b9shell .dlist { flex:1; overflow-y:auto; margin-top:10px; padding-right:6px; }
#b9shell .dlist::-webkit-scrollbar { width:9px; }
#b9shell .dlist::-webkit-scrollbar-thumb { background:#3a3428; }
#b9shell .opt { display:flex; align-items:center; gap:13px; padding:9px 12px;
  border:1px solid transparent; background:rgba(232,221,200,.025); cursor:pointer;
  margin-bottom:2px; }
#b9shell .opt .on1 { flex:1; min-width:0; }
#b9shell .opt .n { font-size:15px; letter-spacing:.10em; }
#b9shell .opt .b { font-size:11.5px; color:#6b6455; font-style:italic; margin-top:3px;
  line-height:1.5; }
#b9shell .opt .r { flex:0 0 auto; text-align:right; font-size:10.5px; letter-spacing:.18em;
  color:#6b6455; text-transform:uppercase; }
#b9shell .opt.sel { border-color:#ffd27a; background:rgba(255,210,122,.10); }
#b9shell .opt.sel .n { color:#ffd27a; }
#b9shell .opt.locked .n { color:#5d5749; }
#b9shell .opt.locked .r { color:#7a3d38; }
#b9shell .opt.fitted { background:rgba(140,232,160,.07); }
#b9shell .opt.fitted .n:after { content:" \\2713"; color:#8ce8a0; }

/* The level bar under a gun, and the three prestiges past the end of it. */
#b9shell .lvbar { position:relative; height:3px; background:rgba(232,221,200,.12); margin-top:10px; }
#b9shell .lvbar .f { position:absolute; left:0; top:0; bottom:0; background:#ffd27a; }
#b9shell .lvnote { display:flex; justify-content:space-between; font-size:10.5px;
  letter-spacing:.18em; color:#6b6455; text-transform:uppercase; margin-top:6px; }
#b9shell .pgold { color:#ffd27a; } #b9shell .pplatinum { color:#d8e6f2; }
#b9shell .pdiamond { color:#8fe3ff; }

/* The preview: what the gun is, with the part you are hovering already
   on it. The numbers move as you move down the list -- an arrow beside
   each one saying which way it went and by how much. */
#b9shell .preview { border-top:1px solid #37312790; margin-top:10px; padding-top:11px;
  display:flex; gap:18px; align-items:flex-start; }
/* A slot with nothing to draw -- the keychain before diamond, a plain
   equipment list -- left a rule across the panel with empty space under
   it, which reads as something that failed to load. */
#b9shell .preview.off { display:none; }
#b9shell .gunart { flex:0 0 300px; height:118px; }
#b9shell .gunart svg { width:100%; height:100%; overflow:visible; }
#b9shell .gunart .body { stroke:#7d6f5c; }
#b9shell .gunart .metal { stroke:#9aa0a8; }
#b9shell .gunart .part { stroke:#ffd27a; }
#b9shell .stats { flex:1; min-width:0; display:grid; grid-template-columns:repeat(2,1fr);
  gap:3px 20px; }
#b9shell .stat { display:flex; align-items:center; gap:9px; font-size:11px; letter-spacing:.14em;
  text-transform:uppercase; color:#6b6455; }
#b9shell .stat .sn { flex:0 0 96px; }
#b9shell .stat .sb { position:relative; flex:1; height:3px; background:rgba(232,221,200,.12); }
#b9shell .stat .sb i { position:absolute; left:0; top:0; bottom:0; background:#8a8272; }
#b9shell .stat .sb u { position:absolute; top:-2px; bottom:-2px; width:2px; background:#ffd27a; }
#b9shell .stat .sv { flex:0 0 58px; text-align:right; color:#a89b80;
  font-variant-numeric:tabular-nums; }
#b9shell .stat.up .sv { color:#8ce8a0; } #b9shell .stat.down .sv { color:#d2705f; }
#b9shell .confirm { display:flex; gap:2px; margin-top:11px; }
#b9shell .confirm .item { flex:1; justify-content:center; font-size:14px; padding:10px 0; }

@media (max-width: 900px) {
  #b9shell .mppane { flex-direction:column; gap:14px; }
  #b9shell .lobcol, #b9shell .slots { flex:none; }
  #b9shell .lobside { max-width:none; }
  #b9shell .train svg { opacity:.22; }
}
`;

/* ================================================================
   MARKUP
   ================================================================ */

var root = null, el = {};

function q(sel) { return root.querySelector(sel); }

function buildDom() {
  var st = document.createElement('style');
  st.textContent = CSS + CSS2 + CSS3;
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

  <div class="screen maps">
    <div class="maphead"><h2>ZOMBIES</h2><span class="sub">choose your ground</span></div>
    <div class="mapwrap">
      <div class="maplist"></div>
      <div class="mappanel">
        <div class="mapshot"></div>
        <div class="mapdots"></div>
        <div class="mapdesc"></div>
        <div class="mapmeta"></div>
      </div>
    </div>
    <div class="foot mapfoot"></div>
  </div>

  <div class="screen mp">
    <div class="train"><div class="fig"></div><div class="vig"></div></div>
    <div class="mphead">
      <div class="mptabs">
        <div class="mptab lobtab">Lobby</div>
        <div class="mptab loadtab">Loadout</div>
      </div>
      <span class="sp"></span>
      <div class="who"></div>
    </div>
    <div class="mpbody">
      <div class="mppane lobby">
        <div class="lobcol">
          <div class="card modecard"><h3>Game mode</h3><div class="modelist"></div></div>
          <div class="card mapcard"><h3>Map</h3><div class="mplist"></div></div>
        </div>
        <div class="lobside">
          <div class="card lobinfo"></div>
          <div class="card"><h3>Lobby &mdash; six a side</h3><div class="roster"></div></div>
          <div class="gowrap"></div>
        </div>
      </div>
      <div class="mppane loadout">
        <div class="slots"></div>
        <div class="detail">
          <div class="dhead"><h3 class="dname">&mdash;</h3><span class="tagline"></span></div>
          <div class="pg"></div>
          <div class="dlist"></div>
          <div class="preview">
            <div class="gunart"></div>
            <div class="stats"></div>
          </div>
          <div class="confirm"></div>
        </div>
      </div>
    </div>
    <div class="mpfoot"></div>
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

  /* The two tabs answer a pointer as well as the shoulder buttons.
     Wired here rather than in openMP, because openMP runs every time
     you change tab and a listener added there would stack up. */
  el = {
    load: q('.load'), menu: q('.menu'), setscreen: q('.setscreen'), pause: q('.pause'),
    fill: q('.fill'), pct: q('.pct'), step: q('.step'), tip: q('.tip'),
    mainlist: q('.mainlist'), mfoot: q('.menu .foot'),
    maps: q('.maps'), maplist: q('.maplist'), mapshot: q('.mapshot'),
    mapdots: q('.mapdots'), mapdesc: q('.mapdesc'), mapmeta: q('.mapmeta'),
    mapfoot: q('.mapfoot'),
    tabs: q('.tabs'), setbody: q('.setbody'), setfoot: q('.setfoot'),
    mp: q('.mp'), train: q('.train .fig'), mptabs: q('.mptabs'),
    lobtab: q('.lobtab'), loadtab: q('.loadtab'), mpwho: q('.mphead .who'),
    lobby: q('.lobby'), loadoutp: q('.loadout'),
    modelist: q('.modelist'), mplist: q('.mplist'), lobinfo: q('.lobinfo'),
    roster: q('.roster'), gowrap: q('.gowrap'),
    slots: q('.slots'), dname: q('.dname'), tagline: q('.tagline'), dpg: q('.detail > .pg'),
    dlist: q('.dlist'), gunart: q('.gunart'), dstats: q('.stats'),
    confirm: q('.confirm'), mpfoot: q('.mpfoot'),
    pbody: q('.pbody'), pauseacts: q('.pauseacts'), prd: q('.pausehead .rd'),
  };

  el.lobtab.addEventListener('click', function () { if (mpTab !== 'lobby') { beep('move'); openMP('lobby'); } });
  el.loadtab.addEventListener('click', function () { if (mpTab !== 'loadout') { beep('move'); openMP('loadout'); } });
}

function show(which) {
  ['load', 'menu', 'maps', 'mp', 'setscreen', 'pause'].forEach(function (k) {
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
      handle = B.start({ canvas: opts.canvas || '#game', settings: SHELL.all(), map: SHELL.bootMap });
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
    /* Straight back to where you were. Changing map reloads the page to
       build the other one, and dropping the player on the main menu after
       that reads as the game having forgotten what they clicked. */
    if (resumeMaps) { resumeMaps = false; openMaps(); } else openMain();
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

var nav = { rows: [], i: 0, onBack: null, live: false, focused: null };

function navSet(rows, onBack, keep) {
  nav.focused = null;
  nav.rows = rows.filter(function (r) { return r && !r.skip; });
  nav.onBack = onBack || null;
  if (!keep || nav.i >= nav.rows.length) nav.i = 0;
  while (nav.i < nav.rows.length && nav.rows[nav.i].disabled) nav.i++;
  if (nav.i >= nav.rows.length) nav.i = 0;
  nav.live = true;
  navPaint(false);
}

function navClear() { nav.rows = []; nav.live = false; nav.onBack = null; nav.focused = null; }

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
  /* A row may own something outside itself -- the map screen's whole
     preview panel belongs to whichever map is selected. `onFocus` fires
     when the selection LANDS on a row, from any of the three ways it can
     get there, and only when it changes, so a repaint of the list does
     not restart a cross-fade that is already running. */
  if (cur && cur.onFocus && nav.focused !== cur) { nav.focused = cur; cur.onFocus(); }
  else if (!cur) nav.focused = null;
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
  closeMaps();
  closeMP();
  show('menu');
  setPhase('menu');
  el.mainlist.innerHTML = '';
  var rows = [];

  var zombies = mkItem('Play Zombies', 'choose your ground');
  el.mainlist.appendChild(zombies);
  rows.push(wire({ el: zombies, onEnter: openMaps }));

  /* Multiplayer only appears if its tables loaded. A row that opens a
     screen with nothing in it is worse than a row that is not there. */
  if (W.MP_DATA) {
    var mpr = mkItem('Multiplayer', 'six a side, and a loadout to bring');
    el.mainlist.appendChild(mpr);
    rows.push(wire({ el: mpr, onEnter: function () { openMP('lobby'); } }));
  }

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

/* ================================================================
   MAP SELECT
   ================================================================
   PLAY ZOMBIES does not drop you into a bunker any more, because there
   is going to be more than one place to be dropped into.

   Each map is a row; the row you are on fills the panel beside it with
   that map's photographs, which cross-fade through one another on a slow
   cycle, and a line about what the place is. Keyboard, mouse and pad all
   move the same selection -- hovering a row with the pointer moves the
   pad's cursor onto it too, so the two never disagree about what is
   selected and what the panel is showing.

   `shots` are real screenshots of the map taken out of the engine, so a
   card cannot drift away from what the map actually looks like. A map
   with no shots yet gets a plate rather than a broken image. */
var MAPS = [
  {
    id: 'bunker9', name: 'Bunker Nine', status: 'ready',
    where: 'North Atlantic coast', year: '1943',
    blurb: 'A gun emplacement dug into the headland and abandoned in a hurry. '
      + 'Four windows, one generator, and a hole in the roof that was not there yesterday.',
    shots: ['shots/bunker9-1.jpg', 'shots/bunker9-2.jpg', 'shots/bunker9-3.jpg'],
  },
  {
    id: 'coastline', name: 'Coastline', status: 'ready',
    where: 'the dock', year: '—',
    blurb: 'A mown green running down to a seawall, a pier out over the water with a '
      + 'pavilion on the end of it, and a boathouse. Built from the real place. '
      + 'Nothing indoors to hold: the walk between the two ends of it is the map.',
    /* Engine screenshots of the map, the same as Bunker Nine's -- NOT the
       photographs it was built from. Those have people in them and belong
       to whoever took them, not to a public repository. */
    shots: ['shots/coastline-1.jpg', 'shots/coastline-2.jpg', 'shots/coastline-3.jpg'],
  },
];

var mapIdx = 0;
var fadeTimer = null, shotIdx = 0;

function mapById(id) { for (var i = 0; i < MAPS.length; i++) if (MAPS[i].id === id) return MAPS[i]; return null; }
function indexOfMap(id) { for (var i = 0; i < MAPS.length; i++) if (MAPS[i].id === id) return i; return 0; }

/* The picture stack for one map, built once per selection. Every shot is
   an <img> that is already in the DOM; showing one is a class. */
function paintShots(m) {
  el.mapshot.innerHTML = '';
  el.mapdots.innerHTML = '';
  shotIdx = 0;
  if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; }

  if (!m.shots.length) {
    var ph = document.createElement('div');
    ph.className = 'ph on';
    ph.textContent = m.status === 'building' ? 'in development' : 'no images';
    el.mapshot.appendChild(ph);
    return;
  }
  m.shots.forEach(function (src, i) {
    var im = document.createElement('img');
    im.src = src;
    im.alt = m.name;
    if (i === 0) im.className = 'on';
    /* A shot that will not load must not leave a black rectangle sitting
       where a photograph should be. */
    /* A shot that will not load must not leave a black rectangle sitting
       where a photograph should be, and if NONE of them load the panel
       falls back to the plate rather than to an empty box. */
    im.addEventListener('error', function () {
      im.dataset.dead = '1';
      im.classList.remove('on');
      var live = el.mapshot.querySelectorAll('img:not([data-dead])');
      if (live.length) { if (!el.mapshot.querySelector('img.on')) live[0].classList.add('on'); return; }
      if (el.mapshot.querySelector('.ph')) return;
      var ph = document.createElement('div');
      ph.className = 'ph on';
      ph.textContent = 'no images';
      el.mapshot.appendChild(ph);
    });
    el.mapshot.appendChild(im);
    var d = document.createElement('i');
    if (i === 0) d.className = 'on';
    el.mapdots.appendChild(d);
  });
  if (m.shots.length < 2) return;
  fadeTimer = setInterval(function () {
    var imgs = el.mapshot.querySelectorAll('img');
    var dots = el.mapdots.querySelectorAll('i');
    if (!imgs.length) return;
    var guard = 0, next = shotIdx;
    do { next = (next + 1) % imgs.length; guard++; }
    while (imgs[next].dataset.dead && guard <= imgs.length);
    if (next === shotIdx) return;
    imgs[shotIdx].classList.remove('on');
    if (dots[shotIdx]) dots[shotIdx].classList.remove('on');
    shotIdx = next;
    imgs[shotIdx].classList.add('on');
    if (dots[shotIdx]) dots[shotIdx].classList.add('on');
  }, 3200);
}

function paintMap() {
  var m = MAPS[mapIdx];
  if (!m) return;
  var kids = el.maplist.children;
  for (var i = 0; i < kids.length; i++) kids[i].classList.toggle('sel', i === mapIdx);
  paintShots(m);
  el.mapdesc.textContent = m.blurb;
  el.mapmeta.innerHTML =
    '<span>WHERE <b>' + m.where + '</b></span>'
    + '<span>YEAR <b>' + m.year + '</b></span>'
    + '<span>STATUS <b>' + (m.status === 'ready' ? 'playable' : 'in development') + '</b></span>';
}

function openMaps() {
  show('maps');
  setPhase('menu');
  el.maplist.innerHTML = '';
  var rows = [];
  MAPS.forEach(function (m, i) {
    var d = document.createElement('div');
    d.className = 'mapitem' + (m.status === 'ready' ? '' : ' off');
    d.innerHTML = '<div class="nm"></div><div class="st"></div>';
    d.querySelector('.nm').textContent = m.name;
    d.querySelector('.st').textContent = m.status === 'ready' ? 'playable' : 'in development';
    el.maplist.appendChild(d);
    /* Everything is selectable so you can look at a map you cannot play
       yet; only launching is blocked. A row you cannot enter that you
       also cannot move onto is just a name you can never read. */
    rows.push(wire({
      el: d,
      onEnter: function () { if (m.status === 'ready') intoGame(m); else beep('back'); },
      onFocus: function () { mapIdx = i; paintMap(); },
    }));
  });
  el.mapfoot.innerHTML =
    '<div><b>&uarr;&darr;</b> choose a map &nbsp; <b>Enter / A</b> drop in &nbsp; <b>Esc / B</b> back</div>';
  navSet(rows, openMain);
  /* Open on the map the page is actually BUILT with, not always on the
     first row. Coming back from the reload that a map change causes, the
     cursor has to land on the map you chose -- landing on Bunker Nine
     again would read as the choice not having taken. */
  mapIdx = Math.max(0, indexOfMap(SHELL.bootMap));
  nav.i = Math.min(mapIdx, Math.max(0, nav.rows.length - 1));
  navPaint(false);
  paintMap();
  tabHook = null; startHook = null;
}

/* Leaving the screen stops the cross-fade. An interval left running
   behind a hidden screen is a timer that swaps images nobody can see for
   as long as the tab is open. */
function closeMaps() { if (fadeTimer) { clearInterval(fadeTimer); fadeTimer = null; } }

/* Into the game. The character picker the game already owns IS the last
   step of the main menu, so this hands over to it rather than building a
   second one: the shell steps out of the way and the title screen, which
   knows every hero and their bio, takes the click. */
function intoGame(map) {
  closeMaps();
  /* Which map, told to the game as well as remembered here. There is one
     map that can be played today, so this changes nothing yet -- but the
     choice is made in the menu, and the menu is the only place that knows
     it, so it has to be handed over rather than assumed. */
  var want = (map && map.id) || 'bunker9';

  /* The game builds its map during the boot sequence, which is long
     before you reach this screen -- so choosing a map that is not the one
     already standing means building a different one.

     That is a page reload, deliberately. Tearing one map down and putting
     another up inside a live session means unpicking fourteen things the
     round loop holds pointers into, and getting any one of them wrong is
     a bug that only shows up ten rounds in. Nothing is lost by reloading
     HERE: you are in the menu, you have not started playing, and the
     loading screen that comes back is the one you already sat through
     once. The choice is remembered across the reload and the shell comes
     straight back to this screen with it selected. */
  if (want !== SHELL.bootMap) {
    try {
      W.localStorage.setItem(MAP_KEY, want);
      W.localStorage.setItem(MAP_RESUME, '1');
    } catch (e) { /* storage off: fall through and play what is built */ }
    try { W.location.reload(); return; } catch (e) { /* cannot reload; play what is built */ }
  }
  SHELL.map = want;
  try { W.localStorage.setItem(MAP_KEY, want); } catch (e) { /* storage off */ }
  if (handle && handle.S) handle.S.mapId = SHELL.map;
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
   MULTIPLAYER
   ================================================================
   Two tabs and one background.

   LOBBY is the mode, the map, who is in the game, and the button. The
   background of it is the operator you picked, on a range, running a
   drill -- see the training animation at the top of CSS3 for why it is
   an SVG skeleton and not a video.

   LOADOUT is a primary, a secondary, a tactical, a lethal, an ability
   and five killstreaks, plus the attachments on the two guns.

   WHAT THE LOADOUT SCREEN IS FOR, WHICH IS NOT WHAT ZOMBIES' IS FOR

   Zombies sells attachments for points: the decision is what you can
   afford. Multiplayer gives them away and charges the gun instead --
   you level a gun by using it and the parts arrive one at a time. So
   the screen has a different job. It is not a shop. It is a place to
   find out what a part DOES before you take it onto a map, which is
   why focusing a row is enough to put the part on the gun in the
   picture and move every stat bar underneath it. You look at it, then
   you press the button. Nobody should have to go and lose a match to
   discover that the long barrel cost them a tenth of a second of aim.

   Everything is kept in one blob in local storage, and every read of it
   goes through mpLoad() so a blob written by an older version cannot
   put a missing gun in a slot.
   ================================================================ */

var MP_KEY = 'b9.mp.v1';
var MP = null;               // window.MP_DATA, or null if it did not load
var mp = null;               // the saved state

function mpReady() {
  if (!MP) MP = W.MP_DATA || null;
  return !!MP;
}

/* Everything the player has done in multiplayer, with every field
   checked on the way in. A gun id that no longer exists, a killstreak
   that was renamed, a loadout saved before a slot existed -- all of
   them arrive here as a menu with a blank row in it and no way to fix
   it, so they are repaired on load instead. */
function mpLoad() {
  if (mp) return mp;
  var raw = null;
  try { raw = W.localStorage.getItem(MP_KEY); } catch (e) { /* storage off */ }
  var got = null;
  try { got = raw ? JSON.parse(raw) : null; } catch (e) { got = null; }
  mp = got && typeof got === 'object' ? got : {};
  if (!MP) return mp;

  var L = MP.defaultLoadout();
  var saved = mp.loadout && typeof mp.loadout === 'object' ? mp.loadout : {};
  function keep(key, ok) { if (ok(saved[key])) L[key] = saved[key]; }
  keep('primary', function (v) { var g = MP.gun(v); return g && g.cls !== 'launcher' && !g.shield; });
  keep('secondary', function (v) { var g = MP.gun(v); return g && (g.cls === 'pistol' || g.cls === 'launcher' || g.shield); });
  keep('tactical', function (v) { return MP.TACTICALS.some(function (t) { return t.id === v; }); });
  keep('lethal', function (v) { return MP.LETHALS.some(function (t) { return t.id === v; }); });
  keep('ability', function (v) { return MP.ABILITIES.some(function (t) { return t.id === v; }); });
  keep('camo', function (v) { return MP.CAMOS.some(function (c) { return c.id === v; }); });
  if (saved.keychain && saved.keychain.shape) L.keychain = saved.keychain;
  ['primaryAtt', 'secondaryAtt'].forEach(function (k) {
    var g = MP.gun(L[k === 'primaryAtt' ? 'primary' : 'secondary']);
    var list = Array.isArray(saved[k]) ? saved[k] : [];
    var seen = {}, out = [];
    list.forEach(function (id) {
      var a = MP.att(id);
      if (!a || !g || !MP.fits(a, g) || seen[a.slot] || out.length >= MP.MAX_FITTED) return;
      seen[a.slot] = 1; out.push(id);
    });
    L[k] = out;
  });
  if (Array.isArray(saved.streaks)) {
    var ks = [], sseen = {};
    saved.streaks.forEach(function (id) {
      if (!MP.KILLSTREAKS.some(function (k2) { return k2.id === id; }) || sseen[id] || ks.length >= 5) return;
      sseen[id] = 1; ks.push(id);
    });
    while (ks.length < 5) {
      var fill = MP.KILLSTREAKS.filter(function (k2) { return !sseen[k2.id]; })[0];
      if (!fill) break;
      sseen[fill.id] = 1; ks.push(fill.id);
    }
    L.streaks = ks;
  }
  mp.loadout = L;

  var pg = mp.progress && typeof mp.progress === 'object' ? mp.progress : {};
  mp.progress = {};
  MP.GUNS.forEach(function (g) {
    var p = pg[g.id];
    mp.progress[g.id] = (p && typeof p.xp === 'number' && isFinite(p.xp))
      ? { xp: Math.max(0, p.xp), kills: Math.max(0, p.kills | 0), heads: Math.max(0, p.heads | 0),
        metres: Math.max(0, p.metres | 0) }
      : MP.newProgress();
  });
  if (!MP.MODES.some(function (m) { return m.id === mp.mode; })) mp.mode = MP.MODES[0].id;
  if (!MP.MAPS.some(function (m) { return m.id === mp.map; })) mp.map = MP.MAPS[0].id;
  return mp;
}

function mpSave() {
  try { W.localStorage.setItem(MP_KEY, JSON.stringify(mp)); } catch (e) { /* storage off */ }
}

function prog(gunId) { return (mp && mp.progress && mp.progress[gunId]) || MP.newProgress(); }

/* ---------------- the operator, on a range ----------------
   Bones, the same as the loading zombie: every limb is a stroke drawn
   straight DOWN from its own origin inside a group already translated
   to the joint, so rotating the inner group swings the limb about the
   joint and a child translated to the end of the bone is the next joint
   for nothing.

   Two colours come out of the character you actually picked -- the skin
   and the sleeve -- because those are the two things you see of
   yourself in this game, and the man in the lobby should be the man in
   your hands. */

function hex(n) { return '#' + ('000000' + (n >>> 0).toString(16)).slice(-6); }

function heroNow() {
  var sys = W.__T_SYS, S = handle && handle.S;
  var id = (S && S.heroId) || null;
  var H = sys && sys.HEROES && id ? sys.HEROES[id] : null;
  if (!H) return { id: id, name: 'OPERATOR', skin: '#cdc4b0', sleeve: '#6f6a58' };
  return {
    id: id, name: H.name || 'OPERATOR',
    skin: hex(H.look && H.look.skin != null ? H.look.skin : 0xcdc4b0),
    sleeve: hex(H.look && H.look.sleeve != null ? H.look.sleeve : 0x6f6a58),
  };
}

function trainerSvg(h) {
  /* One limb. `x,y` is the joint, `len` the bone, `w` the thickness,
     `cls` the group that carries the animation, and `inner` whatever
     hangs off the far end. */
  function limb(x, y, cls, w, len, tone, inner) {
    return '<g transform="translate(' + x + ',' + y + ')"><g class="' + cls + '">'
      + '<path class="bone" stroke="' + tone + '" stroke-width="' + w + '" d="M0,0 L0,' + len + '"/>'
      + (inner ? '<g transform="translate(0,' + len + ')">' + inner + '</g>' : '')
      + '</g></g>';
  }
  var sk = h.skin, sl = h.sleeve;

  /* The rifle, and everything that happens at it. Drawn once, inside
     the group that carries it, so the flash is at the muzzle and the
     brass comes out of the ejection port without either of them having
     to know where the gun is this frame. */
  var rifle =
    '<g class="rig"><g transform="translate(0,0)">'
    + '<path class="wood" stroke-width="10" d="M-34,20 L-8,13"/>'
    + '<path class="body" stroke="#7d6f5c" stroke-width="11" stroke-linecap="square" fill="none" d="M-8,11 L36,11"/>'
    + '<path class="steel" stroke-width="7" d="M14,16 L10,42"/>'
    + '<path class="cloth" stroke-width="7" d="M2,16 L-3,34"/>'
    + '<path class="wood" stroke-width="9" d="M36,10 L72,10"/>'
    + '<path class="steel" stroke-width="4" d="M72,10 L108,10"/>'
    + '<path class="steel" stroke-width="3" d="M100,10 L100,1"/>'
    + '<path class="steel" stroke-width="3" d="M-2,4 L-2,-2"/>'
    + '<path class="steel" stroke-width="5" d="M6,2 L26,2"/>'
    /* muzzle flash */
    + '<g class="flash"><path fill="#ffd27a" opacity=".92" d="M108,10 L130,2 L122,10 L130,18 Z"/>'
    + '<circle cx="110" cy="10" r="6" fill="#fff3d0" opacity=".8"/></g>'
    /* one fired case, thrown three times */
    + '<g class="brass"><rect x="30" y="0" width="7" height="3.4" rx="1.4" fill="#b08d4a"/></g>'
    /* the magazine that leaves */
    + '<g class="magOut"><path class="steel" stroke-width="7" d="M14,16 L10,42"/></g>'
    + '</g></g>';

  /* Arms. The forearm of the front arm is where the rifle is held, so
     it is keyed against the rig rather than solved to it -- the same
     bargain the loading zombie makes, and at this size nobody can tell
     the difference between a solve and a good key. */
  var armBack = limb(1, 3, 'armBack', 9, 30, sl,
    '<path class="bone" stroke="' + sl + '" stroke-width="7.5" d="M0,0 L0,24"/>'
    + '<circle cx="1" cy="27" r="4.6" fill="' + sk + '"/>');
  var armFront = limb(9, 7, 'armFront', 10, 32, sl,
    '<path class="bone" stroke="' + sl + '" stroke-width="8.5" d="M0,0 L0,26"/>'
    + '<circle cx="2" cy="29" r="5" fill="' + sk + '"/>');

  /* The figure faces right and the target is on the right, at the far
     end of a 300-wide box. The muzzle reaches x=210 at full extension
     and the board starts at 236, which is the only reason those two
     numbers are what they are: a rifle whose muzzle is inside the
     target reads as a man leaning on it. */
  return '<svg viewBox="0 0 300 440" aria-hidden="true">'
    + '<line x1="0" y1="420" x2="300" y2="420" stroke="#2a251d" stroke-width="2"/>'
    + '<g opacity=".8"><rect class="board" x="236" y="150" width="58" height="84"/>'
    + '<circle class="ring" cx="265" cy="192" r="24" stroke-width="2"/>'
    + '<circle class="ring" cx="265" cy="192" r="14" stroke-width="2"/>'
    + '<circle cx="265" cy="192" r="5" fill="#4a4234"/>'
    + '<path class="board" d="M242,234 L246,420 M288,234 L284,420" stroke-width="3" fill="none"/></g>'
    /* an ammunition crate behind him, open, because the drill has been
       run more than once today */
    + '<g opacity=".55"><rect x="14" y="382" width="58" height="38" fill="#241f18" stroke="#3a3428" stroke-width="2"/>'
    + '<path d="M14,382 L44,368 L102,368 L72,382 Z" fill="none" stroke="#3a3428" stroke-width="2"/>'
    + '<rect x="24" y="392" width="6" height="16" rx="2" fill="#5c4a2a"/>'
    + '<rect x="34" y="392" width="6" height="16" rx="2" fill="#5c4a2a"/>'
    + '<rect x="44" y="392" width="6" height="16" rx="2" fill="#5c4a2a"/></g>'

    + '<g class="breathe">'
    /* far leg first, so the near one draws over it */
    + '<g transform="translate(96,268)"><g>'
    + '<path class="bone far" stroke="' + sl + '" stroke-width="18" d="M0,0 L-20,62"/>'
    + '<path class="bone far" stroke="' + sl + '" stroke-width="15" d="M-20,62 L-28,138"/>'
    + '<path class="bone far" stroke="#3a3428" stroke-width="10" d="M-28,138 L-46,146"/>'
    + '</g></g>'
    /* torso, and the head on the end of it */
    + '<g transform="translate(96,268)"><g class="torso">'
    + '<path class="bone" stroke="' + sl + '" stroke-width="24" d="M0,-4 L6,-80"/>'
    + '<path class="bone" stroke="' + sl + '" stroke-width="27" d="M-1,2 L1,-14"/>'
    + '<path class="cloth" stroke-width="4" d="M-7,-28 L13,-48"/>'
    + '<path class="cloth" stroke-width="4" d="M-8,-44 L12,-30"/>'
    + '<rect x="-13" y="-26" width="13" height="17" rx="3" fill="#3a3428" opacity=".95"/>'
    + '<rect x="2" y="-24" width="11" height="15" rx="3" fill="#3a3428" opacity=".95"/>'
    + '<g transform="translate(8,-92)"><g class="head">'
    + '<path class="bone" stroke="' + sk + '" stroke-width="9" d="M0,0 L2,-8"/>'
    + '<ellipse cx="5" cy="-18" rx="10.5" ry="12" fill="' + sk + '"/>'
    + '<path d="M-6,-20 A12,12 0 0 1 16,-20 L17,-16 L14,-17 L-5,-16 Z" fill="#3f4238"/>'
    + '<path d="M-6,-16 L-9,-13 L-4,-13 Z" fill="#3f4238"/>'
    + '<circle cx="12" cy="-18" r="1.6" fill="#23201a"/>'
    + '<path stroke="#23201a" stroke-width="1.2" fill="none" d="M13,-11 L9,-10"/>'
    + '</g></g>'
    /* shoulder: the rifle and both arms hang here, so the whole rig
       leans with the body instead of floating in front of it */
    + '<g transform="translate(6,-84)">' + rifle + armBack + armFront + '</g>'
    + '</g></g>'
    /* near leg */
    + '<g transform="translate(100,270)"><g>'
    + '<path class="bone" stroke="' + sl + '" stroke-width="19" d="M0,0 L18,62"/>'
    + '<path class="bone" stroke="' + sl + '" stroke-width="16" d="M18,62 L26,138"/>'
    + '<path class="bone" stroke="#3a3428" stroke-width="11" d="M26,138 L48,146"/>'
    + '</g></g>'
    + '</g></svg>';
}

var trainerFor = null;
function paintTrainer() {
  var h = heroNow();
  if (trainerFor === h.id + '|' + h.skin) return;   // do not restart the drill
  trainerFor = h.id + '|' + h.skin;
  el.train.innerHTML = trainerSvg(h);
  el.mpwho.innerHTML = '<span>Operator</span><b>' + esc(h.name) + '</b>';
}

/* ---------------- the screen ---------------- */

var mpTab = 'lobby';

function openMP(tab) {
  if (!mpReady()) { beep('back'); return; }
  mpLoad();
  closeMaps();
  show('mp');
  setPhase('menu');
  mpTab = tab || mpTab || 'lobby';
  paintTrainer();
  el.lobtab.classList.toggle('sel', mpTab === 'lobby');
  el.loadtab.classList.toggle('sel', mpTab === 'loadout');
  el.mp.classList.toggle('deep', mpTab === 'loadout');
  el.lobby.classList.toggle('on', mpTab === 'lobby');
  el.loadoutp.classList.toggle('on', mpTab === 'loadout');
  /* The shoulder buttons move between the two tabs wherever you are in
     either of them, which is the one thing a pad expects a tabbed
     screen to do. */
  tabHook = function (d) { openMP(d > 0 ? 'loadout' : 'lobby'); };
  startHook = null;
  if (mpTab === 'lobby') paintLobby(); else openLoadout();
}

function closeMP() { tabHook = null; startHook = null; }

/* ---------------- lobby ---------------- */

/* Twelve names on the board and one of them is yours. The bots are
   drawn from a fixed list and dealt alternately so neither side gets
   all the good ones, and they are labelled, because a lobby that hides
   which of the twelve are people is a lobby that lies to you. */
function lobbyRoster() {
  var names = MP.BOT_NAMES.slice();
  var me = heroNow().name.replace(/^(CPL|SGT|PFC|PVT|LT)\.\s*/i, '');
  var us = [{ name: me, bot: false }], them = [];
  for (var i = 0; us.length < MP.TEAM_SIZE || them.length < MP.TEAM_SIZE; i++) {
    var nm = names[i % names.length];
    var sk = MP.BOT_SKILL[(i * 3 + 1) % MP.BOT_SKILL.length];
    if (us.length <= them.length) us.push({ name: nm, bot: true, skill: sk });
    else them.push({ name: nm, bot: true, skill: sk });
    if (i > 40) break;
  }
  return { us: us.slice(0, MP.TEAM_SIZE), them: them.slice(0, MP.TEAM_SIZE) };
}

function modeNow() { return MP.MODES.filter(function (m) { return m.id === mp.mode; })[0] || MP.MODES[0]; }
function mapNow() { return MP.MAPS.filter(function (m) { return m.id === mp.map; })[0] || MP.MAPS[0]; }

function paintLobby() {
  var rows = [];
  el.modelist.innerHTML = '';
  MP.MODES.forEach(function (m) {
    var d = document.createElement('div');
    d.className = 'pick' + (m.id === mp.mode ? ' on' : '');
    d.innerHTML = '<div class="nm"></div><div class="sub"></div>';
    d.querySelector('.nm').textContent = m.name;
    d.querySelector('.sub').textContent = m.rule;
    el.modelist.appendChild(d);
    rows.push(wire({ el: d, onEnter: function () { mp.mode = m.id; mpSave(); paintLobby(); } }));
  });

  el.mplist.innerHTML = '';
  MP.MAPS.forEach(function (m) {
    var d = document.createElement('div');
    d.className = 'pick' + (m.id === mp.map ? ' on' : '');
    d.innerHTML = '<div class="nm"></div><div class="sub"></div>';
    d.querySelector('.nm').textContent = m.name;
    d.querySelector('.sub').textContent = m.where;
    el.mplist.appendChild(d);
    rows.push(wire({ el: d, onEnter: function () { mp.map = m.id; mpSave(); paintLobby(); } }));
  });

  var md = modeNow(), mapd = mapNow();
  el.lobinfo.innerHTML =
    '<h3>' + esc(mapd.name) + ' &middot; ' + esc(md.name) + '</h3>'
    + '<div class="mapdesc" style="margin-top:0">' + esc(mapd.blurb) + '</div>'
    + '<div class="mapmeta"><span>LANES <b>' + mapd.lanes.length + '</b></span>'
    + '<span>SIZE <b>' + mapd.size + ' m</b></span>'
    + '<span>LIGHT <b>' + esc(mapd.time) + '</b></span></div>'
    + '<div class="mapmeta" style="margin-top:6px"><span>UP <b>' + esc(mapd.verticality) + '</b></span></div>'
    + (md.bomb ? '<div class="mapmeta" style="margin-top:6px"><span>SITES <b>'
      + mapd.bombs.map(esc).join('</b> &middot; <b>') + '</b></span></div>' : '');

  var r = lobbyRoster();
  function side(list, cls, label) {
    return '<div class="team ' + cls + '"><div class="tn">' + label + '</div>'
      + list.map(function (p) {
        return '<div class="slotline' + (p.bot ? '' : ' me') + '"><span>' + esc(p.name) + '</span>'
          + '<span class="bot">' + (p.bot ? esc(p.skill.name) : 'YOU') + '</span></div>';
      }).join('') + '</div>';
  }
  el.roster.innerHTML = side(r.us, 'us', 'Your side') + side(r.them, 'them', 'Theirs');

  /* The button is here and it is honest about what it does. The lobby,
     the loadout, the guns and the maps are built; the match that runs
     on them is not, and a PLAY button that drops you into nothing is
     worse than one that says so. */
  el.gowrap.innerHTML = '';
  var go = document.createElement('div');
  go.className = 'go';
  go.textContent = 'Find a match';
  el.gowrap.appendChild(go);
  rows.push(wire({
    el: go,
    onEnter: function () {
      beep('back');
      el.mpfoot.innerHTML = '<div><b>' + esc(mapd.name.toUpperCase()) + ' &middot; '
        + esc(md.short) + '</b> &mdash; the lobby, the loadout and the maps are laid out. '
        + 'The match that runs on them is the next thing being built, so there is '
        + 'nothing to drop into yet.</div>';
    },
  }));

  el.mpfoot.innerHTML = '<div><b>&uarr;&darr;</b> move &nbsp; <b>Enter / A</b> choose &nbsp; '
    + '<b>LB / RB</b> lobby and loadout &nbsp; <b>Esc / B</b> back</div>';
  navSet(rows, openMain);
}

/* ---------------- loadout ---------------- */

/* Which slot the left column is on, and which column has the cursor.
   Kept out here so coming back from the lobby tab puts you where you
   were rather than at the top. */
var ld = { slot: 'primary', side: 'slots', hover: null };

function ldGun(which) { return MP.gun(mp.loadout[which]); }
function ldAtt(which) { return mp.loadout[which + 'Att']; }

var SLOT_ROWS = [
  { head: 'Weapons' },
  { id: 'primary', k: 'Primary' },
  { id: 'primaryAtt', k: 'Attachments' },
  { id: 'secondary', k: 'Secondary' },
  { id: 'secondaryAtt', k: 'Attachments' },
  { head: 'Equipment' },
  { id: 'tactical', k: 'Tactical' },
  { id: 'lethal', k: 'Lethal' },
  { id: 'ability', k: 'Ability' },
  { head: 'Killstreaks' },
  { id: 'streak0', k: 'One' }, { id: 'streak1', k: 'Two' }, { id: 'streak2', k: 'Three' },
  { id: 'streak3', k: 'Four' }, { id: 'streak4', k: 'Five' },
  { head: 'Finish' },
  { id: 'camo', k: 'Camo' },
  { id: 'keychain', k: 'Keychain' },
];

function nameOf(list, id) {
  for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i].name;
  return '—';
}

function slotValue(id) {
  var L = mp.loadout;
  if (id === 'primary' || id === 'secondary') {
    var g = MP.gun(L[id]);
    return g ? g.name : '—';
  }
  if (id === 'primaryAtt' || id === 'secondaryAtt') {
    return L[id].length + ' of ' + MP.MAX_FITTED;
  }
  if (id === 'tactical') return nameOf(MP.TACTICALS, L.tactical);
  if (id === 'lethal') return nameOf(MP.LETHALS, L.lethal);
  if (id === 'ability') return nameOf(MP.ABILITIES, L.ability);
  if (id.indexOf('streak') === 0) return nameOf(MP.KILLSTREAKS, L.streaks[+id.slice(6)]);
  if (id === 'camo') return nameOf(MP.CAMOS, L.camo);
  if (id === 'keychain') return L.keychain ? (nameOf(MP.KEYCHAIN_SHAPES, L.keychain.shape)) : 'none';
  return '—';
}

function slotNote(id) {
  var L = mp.loadout;
  if (id === 'primary' || id === 'secondary') {
    var g = MP.gun(L[id]);
    if (!g) return '';
    var pr = prog(g.id), pg = MP.prestigeOf(g, pr);
    return pg ? pg.toUpperCase() : ('LV ' + MP.levelOf(pr));
  }
  if (id.indexOf('streak') === 0) {
    var k = MP.KILLSTREAKS.filter(function (x) { return x.id === L.streaks[+id.slice(6)]; })[0];
    return k ? (k.cost + ' kills') : '';
  }
  return '';
}

function openLoadout() {
  paintSlots();
  paintDetail();
  ldNav();
}

function paintSlots() {
  el.slots.innerHTML = '';
  SLOT_ROWS.forEach(function (r) {
    var d = document.createElement('div');
    if (r.head) {
      d.className = 'lslot head';
      d.innerHTML = '<div class="k"></div>';
      d.querySelector('.k').textContent = r.head;
      el.slots.appendChild(d);
      r._el = null;
      return;
    }
    d.className = 'lslot' + (r.id === ld.slot ? ' sel' : '');
    d.innerHTML = '<div class="k"></div><div class="v"></div><div class="lv"></div>';
    d.querySelector('.k').textContent = r.k;
    d.querySelector('.v').textContent = slotValue(r.id);
    d.querySelector('.lv').textContent = slotNote(r.id);
    /* The pointer handlers belong HERE, on the element, and not in
       ldNav() where they used to be.
     *
       ldNav() only rebuilds the left column's nav rows when the cursor
       is in the left column. Fitting an attachment repaints the slots
       -- new elements -- while the cursor is over in the list, so
       ldNav() took the other branch and the fresh rows came out of it
       with no listeners on them at all. After that, hovering TACTICAL
       or LETHAL or any of the five killstreaks did nothing whatsoever:
       the right-hand column stayed on the attachment list it happened
       to be showing. Attached at the point the element is made, there
       is no path that can miss them. */
    d.addEventListener('mouseenter', function () { selectSlot(r.id, false); });
    d.addEventListener('click', function () { selectSlot(r.id, true); });
    el.slots.appendChild(d);
    r._el = d;
  });
}

/* Put the right-hand column on one slot, and optionally hand it the
   cursor. One path in, so a click and a hover and the pad's right stick
   cannot disagree about what selecting a slot means. */
function selectSlot(id, enter) {
  if (ld.slot !== id) { ld.slot = id; paintDetail(); }
  ld.side = (enter && ldRows.length) ? 'list' : 'slots';
  if (enter && !ldRows.length) beep('back');
  else if (enter) beep('ok');
  ldNav();
}

/* ---- the picture of the gun ----
   Not a photograph and not trying to be: a side elevation in six
   strokes, with a slot for each thing that can be bolted to it. The
   point of it is not that it is a good likeness of an STG 44. The point
   is that when you move onto LONG BARREL the barrel gets longer in
   front of you, so the word on the row and the thing on the gun are
   never two separate pieces of knowledge. */

var ART = {
  assault: { butt: -40, rec: 44, hand: 34, barrel: 34, mag: 26, drop: 20, w: 13 },
  smg:     { butt: -30, rec: 36, hand: 22, barrel: 20, mag: 30, drop: 18, w: 12 },
  lmg:     { butt: -44, rec: 52, hand: 30, barrel: 40, mag: 22, drop: 24, w: 16 },
  special: { butt: -46, rec: 48, hand: 40, barrel: 46, mag: 14, drop: 12, w: 12 },
  pistol:  { butt: 0,   rec: 30, hand: 0,  barrel: 14, mag: 0,  drop: 26, w: 11 },
  launcher:{ butt: -50, rec: 70, hand: 24, barrel: 30, mag: 0,  drop: 14, w: 20 },
};

function gunArt(g, fitted, hover) {
  if (!g) return '';
  var A = ART[g.cls] || ART.assault;
  var has = {}, hoverSlot = null;
  (fitted || []).forEach(function (id) { var a = MP.att(id); if (a) has[a.slot] = a; });
  if (hover) { var ha = MP.att(hover); if (ha) { has[ha.slot] = ha; hoverSlot = ha.slot; } }
  function cls(slot) { return slot === hoverSlot ? 'part' : 'metal'; }
  function st(slot, w) {
    return 'class="' + cls(slot) + '" stroke="' + (slot === hoverSlot ? '#ffd27a' : '#9aa0a8')
      + '" stroke-width="' + w + '" fill="none" stroke-linecap="round"';
  }

  var y = 52, x0 = 74;                 // the receiver starts here
  var bl = A.barrel;
  if (has.barrel && /long|marksman/.test(has.barrel.id)) bl += 26;
  if (has.barrel && /short|cqb/.test(has.barrel.id)) bl -= 12;
  var xRecEnd = x0 + A.rec, xBarEnd = xRecEnd + A.hand + bl;

  /* Framed on the gun rather than on the box it is drawn in. At
     0 0 300 104 the whole thing was a hairline in the corner of an
     empty rectangle: you could see that something had changed and
     not what. */
  var s = '<svg viewBox="24 16 214 84" preserveAspectRatio="xMidYMid meet">';
  /* stock and receiver */
  if (A.butt < 0) {
    var bx = x0 + A.butt;
    s += has.stock
      ? '<path ' + st('stock', /none/.test(has.stock.id) ? 5 : 13) + ' d="M' + bx + ',' + (y + 7)
        + ' L' + (x0 - 2) + ',' + (y + 2) + '"/>'
      : '<path class="body" stroke="#7d6f5c" stroke-width="12" fill="none" stroke-linecap="round" d="M'
        + bx + ',' + (y + 7) + ' L' + (x0 - 2) + ',' + (y + 2) + '"/>';
  }
  s += '<path class="body" stroke="#7d6f5c" stroke-width="' + A.w + '" fill="none" d="M'
    + x0 + ',' + y + ' L' + xRecEnd + ',' + y + '"/>';
  /* handguard and barrel */
  if (A.hand) {
    s += '<path class="body" stroke="#8a7a62" stroke-width="' + (A.w - 2) + '" fill="none" d="M'
      + xRecEnd + ',' + y + ' L' + (xRecEnd + A.hand) + ',' + y + '"/>';
  }
  s += '<path ' + st('barrel', g.cls === 'launcher' ? 16 : 6) + ' d="M'
    + (xRecEnd + A.hand) + ',' + y + ' L' + xBarEnd + ',' + y + '"/>';
  /* grip and trigger guard */
  s += '<path ' + (has.grip ? st('grip', 9) : 'class="body" stroke="#7d6f5c" stroke-width="9" fill="none" stroke-linecap="round"')
    + ' d="M' + (x0 + 12) + ',' + (y + 6) + ' L' + (x0 + 6) + ',' + (y + A.drop) + '"/>';
  /* magazine */
  if (A.mag) {
    var ml = A.mag;
    if (has.mag && /drum/.test(has.mag.id)) ml = 8;
    if (has.mag && /ext/.test(has.mag.id)) ml += 12;
    if (has.mag && /fast/.test(has.mag.id)) ml -= 8;
    s += '<path ' + (has.mag ? st('mag', 10) : 'class="metal" stroke="#9aa0a8" stroke-width="10" fill="none" stroke-linecap="round"')
      + ' d="M' + (x0 + 26) + ',' + (y + 6) + ' L' + (x0 + 21) + ',' + (y + 6 + ml) + '"/>';
    if (has.mag && /drum/.test(has.mag.id)) {
      s += '<circle cx="' + (x0 + 22) + '" cy="' + (y + 28) + '" r="15" fill="none" stroke="'
        + (hoverSlot === 'mag' ? '#ffd27a' : '#9aa0a8') + '" stroke-width="5"/>';
    }
  }
  /* optic on top */
  if (has.optic) {
    var ow = /7x|12x|4x|34x/.test(has.optic.id) ? 34 : 18;
    s += '<path ' + st('optic', 9) + ' d="M' + (x0 + 10) + ',' + (y - 12) + ' L'
      + (x0 + 10 + ow) + ',' + (y - 12) + '"/>'
      + '<path ' + st('optic', 4) + ' d="M' + (x0 + 14) + ',' + (y - 8) + ' L' + (x0 + 14) + ',' + (y - 5) + '"/>';
  } else {
    s += '<path class="metal" stroke="#9aa0a8" stroke-width="3" fill="none" d="M'
      + (xBarEnd - 8) + ',' + y + ' L' + (xBarEnd - 8) + ',' + (y - 8) + '"/>';
  }
  /* muzzle device */
  if (has.muzzle) {
    var mw = /suppress|mono/.test(has.muzzle.id) ? 30 : 12;
    s += '<path ' + st('muzzle', 13) + ' d="M' + xBarEnd + ',' + y + ' L' + (xBarEnd + mw) + ',' + y + '"/>';
  }
  /* underbarrel */
  if (has.under) {
    var ux = xRecEnd + Math.max(10, A.hand - 8);
    s += /bipod/.test(has.under.id)
      ? '<path ' + st('under', 4) + ' d="M' + ux + ',' + (y + 6) + ' L' + (ux - 12) + ',' + (y + 30)
        + ' M' + ux + ',' + (y + 6) + ' L' + (ux + 12) + ',' + (y + 30) + '"/>'
      : '<path ' + st('under', 9) + ' d="M' + ux + ',' + (y + 6) + ' L' + (ux - 2) + ',' + (y + 22) + '"/>';
  }
  /* laser, and its beam */
  if (has.laser) {
    var lx = xRecEnd + 6;
    s += '<rect x="' + lx + '" y="' + (y + 6) + '" width="14" height="8" rx="2" fill="none" stroke="'
      + (hoverSlot === 'laser' ? '#ffd27a' : '#9aa0a8') + '" stroke-width="2"/>';
    if (!/ir/.test(has.laser.id)) {
      s += '<path stroke="#d2705f" stroke-width="1.5" opacity=".75" fill="none" d="M'
        + (lx + 14) + ',' + (y + 10) + ' L236,' + (y + 6) + '"/>';
    }
  }
  return s + '</svg>';
}

/* ---- the bars ----
   Eight numbers, each normalised against a fixed range rather than
   against the other guns in the list, so a bar means the same thing on
   every screen you ever see it on. Half of them are better when they
   are smaller, which is what `inv` is for. */
var STAT_DEFS = [
  { k: 'Damage', get: function (w) { return w.dmg * w.pellets; }, lo: 0, hi: 60, fmt: function (v) { return Math.round(v); } },
  { k: 'Fire rate', get: function (w) { return w.rpm; }, lo: 0, hi: 1300, fmt: function (v) { return Math.round(v) + ' rpm'; } },
  { k: 'Range', get: function (w) { return w.far; }, lo: 0, hi: 200, fmt: function (v) { return Math.round(v) + ' m'; } },
  /* Two different accuracies, because different parts move them and a
     player who fits an optic and sees nothing change reasonably
     concludes the optic does nothing. AIM is the cone with the gun in
     your shoulder, which is what glass and a match barrel buy. HIPFIRE
     is the cone without it, which is what a laser buys. */
  { k: 'Aim', get: function (w) { return w.adsSpread; }, lo: 0.03, hi: 1.6, inv: true, fmt: function (v) { return v.toFixed(2) + '°'; } },
  { k: 'Hipfire', get: function (w) { return w.spread; }, lo: 0, hi: 11, inv: true, fmt: function (v) { return v.toFixed(1) + '°'; } },
  { k: 'Control', get: function (w) { return w.rec[0] + w.rec[1]; }, lo: 0, hi: 5, inv: true, fmt: function (v) { return v.toFixed(2); } },
  { k: 'Handling', get: function (w) { return w.ads; }, lo: 0.10, hi: 0.78, inv: true, fmt: function (v) { return v.toFixed(2) + ' s'; } },
  { k: 'Mobility', get: function (w) { return w.move; }, lo: 0.58, hi: 1.12, fmt: function (v) { return Math.round(v * 100) + '%'; } },
  { k: 'Magazine', get: function (w) { return w.mag; }, lo: 0, hi: 80, fmt: function (v) { return Math.round(v); } },
];

function statFrac(d, v) {
  var f = (v - d.lo) / (d.hi - d.lo);
  if (d.inv) f = 1 - f;
  return Math.max(0, Math.min(1, f));
}

/* The picture, and the rule above it, together. They were separate and
   the rule stayed behind on every slot that has no gun to draw. */
function setArt(html) {
  el.gunart.innerHTML = html || '';
  el.preview.classList.toggle('off', !html);
}

function paintStats(before, after) {
  if (!after) { el.dstats.innerHTML = ''; return; }
  el.dstats.innerHTML = STAT_DEFS.map(function (d) {
    var vb = before ? d.get(before) : null, va = d.get(after);
    var fb = vb == null ? null : statFrac(d, vb), fa = statFrac(d, va);
    var dir = (vb == null || Math.abs(va - vb) < 1e-9) ? '' : (fa > fb ? ' up' : ' down');
    return '<div class="stat' + dir + '"><span class="sn">' + d.k + '</span>'
      + '<span class="sb"><i style="width:' + (fa * 100).toFixed(1) + '%"></i>'
      + (fb == null || dir === '' ? '' : '<u style="left:' + (fb * 100).toFixed(1) + '%"></u>')
      + '</span><span class="sv">' + d.fmt(va) + '</span></div>';
  }).join('');
}

/* ---- the right-hand column ----
   One list, built fresh for whichever slot the left column is on. Every
   row carries what it needs to do when it is focused and what it does
   when it is pressed, so ldNav() below does not have to know what kind
   of slot it is looking at. */

var ldRows = [];        // [{ el, focus, enter, disabled }]

function detailHead(text) {
  var d = document.createElement('div');
  d.className = 'sec';
  d.textContent = text;
  el.dlist.appendChild(d);
}

function detailRow(name, blurb, right, mods) {
  var d = document.createElement('div');
  d.className = 'opt' + (mods && mods.locked ? ' locked' : '') + (mods && mods.fitted ? ' fitted' : '');
  d.innerHTML = '<div class="on1"><div class="n"></div><div class="b"></div></div><div class="r"></div>';
  d.querySelector('.n').textContent = name;
  d.querySelector('.b').textContent = blurb || '';
  d.querySelector('.r').innerHTML = right || '';
  el.dlist.appendChild(d);
  return d;
}

function pushRow(d, focus, enter, disabled) {
  var row = wire({ el: d, onFocus: focus, onEnter: disabled ? null : enter, disabled: !!disabled });
  ldRows.push(row);
  /* wire() moves the cursor onto a row you hover -- but only if the row
     is in the CURRENT nav list, and while the cursor is in the left-hand
     column these are not. Hovering an attachment with a mouse then did
     nothing at all: no preview, no stats, no picture. Hovering one of
     these hands the column over first, and then lands on the row. */
  d.addEventListener('mouseenter', function () {
    if (ld.side === 'list') return;          // wire() already handles it
    var k = ldRows.indexOf(row);
    if (k < 0) return;
    ld.side = 'list';
    nav.i = k;
    ldNav(true);
  });
  return row;
}

function gunBadge(g) {
  var pr = prog(g.id), pg = MP.prestigeOf(g, pr);
  if (pg) return '<span class="p' + pg + '">' + pg + '</span>';
  return 'lv ' + MP.levelOf(pr);
}

function levelStrip(g) {
  var pr = prog(g.id), lv = MP.levelOf(pr), pg = MP.prestigeOf(g, pr);
  var unl = MP.unlockedParts(g, pr).length, all = MP.partCount(g);
  var next = null;
  if (pg !== 'diamond') {
    if (!pg) next = 'Gold at level ' + MP.MAX_LEVEL + ' with all ' + all + ' parts';
    else if (pg === 'gold') next = 'Platinum at 600 kills (' + pr.kills + ')';
    else next = 'Diamond at 1100 kills and 50 heads (' + pr.kills + ' / ' + pr.heads + ')';
  } else next = 'Diamond. The keychain slot is open.';
  return '<div class="lvbar"><div class="f" style="width:'
    + (MP.levelFrac(pr) * 100).toFixed(1) + '%"></div></div>'
    + '<div class="lvnote"><span>' + (pg ? '<b class="p' + pg + '">' + pg.toUpperCase() + '</b>' : 'Level ' + lv)
    + ' &middot; ' + unl + ' of ' + all + ' parts</span><span>' + esc(next) + '</span></div>';
}

function paintDetail() {
  ldRows = [];
  el.dlist.innerHTML = '';
  el.confirm.innerHTML = '';
  setArt('');
  el.dstats.innerHTML = '';
  el.dpg.innerHTML = '';
  var L = mp.loadout, slot = ld.slot;

  /* ---- a gun ---- */
  if (slot === 'primary' || slot === 'secondary') {
    var prim = slot === 'primary';
    el.dname.textContent = prim ? 'Primary' : 'Secondary';
    el.tagline.textContent = prim ? 'anything but a launcher' : 'a pistol, a launcher or the shield';
    MP.CLASSES.forEach(function (c) {
      var list = MP.gunsOf(c.id).filter(function (g) {
        return prim ? (g.cls !== 'launcher' && !g.shield) : (g.cls === 'pistol' || g.cls === 'launcher' || g.shield);
      });
      if (!list.length) return;
      detailHead(c.name);
      list.forEach(function (g) {
        var d = detailRow(g.name, g.blurb, gunBadge(g), { fitted: L[slot] === g.id });
        pushRow(d, function () {
          ld.hover = g.id;
          setArt(gunArt(g, L[slot] === g.id ? L[slot + 'Att'] : [], null));
          paintStats(null, MP.build(g.id, []));
          el.dpg.innerHTML = levelStrip(g);
        }, function () {
          if (L[slot] !== g.id) { L[slot] = g.id; L[slot + 'Att'] = []; mpSave(); }
          paintSlots(); paintDetail(); ldNav(true);
        });
      });
    });
    return;
  }

  /* ---- the attachments on one of them ---- */
  if (slot === 'primaryAtt' || slot === 'secondaryAtt') {
    var which = slot === 'primaryAtt' ? 'primary' : 'secondary';
    var g = MP.gun(L[which]);
    el.dname.textContent = g ? g.name : '—';
    el.tagline.textContent = 'free. the gun is the price';
    if (!g) return;
    var pr = prog(g.id), fitted = L[which + 'Att'];
    el.dpg.innerHTML = levelStrip(g);
    setArt(gunArt(g, fitted, null));
    paintStats(null, MP.build(g.id, fitted));

    MP.SLOTS.forEach(function (S2) {
      var parts = MP.partsFor(g, S2.id);
      if (!parts.length) return;
      detailHead(S2.name);
      parts.forEach(function (a) {
        var on = fitted.indexOf(a.id) >= 0;
        var locked = !MP.isUnlocked(a, pr);
        var full = !on && fitted.length >= MP.MAX_FITTED
          && !fitted.some(function (id) { return MP.att(id).slot === a.slot; });
        var right = locked ? ('level ' + a.lvl) : (full ? 'no room' : (on ? 'fitted' : ''));
        var d = detailRow(a.name, a.blurb, right, { locked: locked, fitted: on });
        pushRow(d, function () {
          ld.hover = a.id;
          /* Focus is the preview. The gun in the picture puts the part
             on, every bar underneath moves to what it would be, and the
             mark left behind on each bar is where it is now -- so the
             confirm is a decision and not a guess. */
          var next = on ? fitted.filter(function (id) { return id !== a.id; })
            : fitted.filter(function (id) { return MP.att(id).slot !== a.slot; }).concat([a.id]);
          setArt(gunArt(g, next, on ? null : a.id));
          paintStats(MP.build(g.id, fitted), MP.build(g.id, locked || full ? fitted : next));
          el.confirm.innerHTML = '';
          var act = document.createElement('div');
          act.className = 'item';
          act.innerHTML = '<span class="t"></span><span class="hint"></span>';
          act.querySelector('.t').textContent = locked
            ? 'Locked until level ' + a.lvl
            : (full ? 'Five is the limit' : (on ? 'Take it off' : 'Fit it'));
          act.querySelector('.hint').textContent = locked
            ? 'kills, or just carrying it, get you there'
            : 'Enter / A';
          el.confirm.appendChild(act);
        }, function () {
          if (locked || full) { beep('back'); return; }
          L[which + 'Att'] = on ? fitted.filter(function (id) { return id !== a.id; })
            : fitted.filter(function (id) { return MP.att(id).slot !== a.slot; }).concat([a.id]);
          mpSave(); paintSlots(); paintDetail(); ldNav(true);
        }, locked || full);
      });
    });
    if (fitted.length) {
      detailHead('All of it');
      var dc = detailRow('Strip the gun', 'Every part off, back to how it came.', 'clear');
      pushRow(dc, function () {
        setArt(gunArt(g, [], null));
        paintStats(MP.build(g.id, fitted), MP.build(g.id, []));
        el.confirm.innerHTML = '';
      }, function () {
        L[which + 'Att'] = []; mpSave(); paintSlots(); paintDetail(); ldNav(true);
      });
    }
    return;
  }

  /* ---- the flat lists ---- */
  var flat = null, cur = null, set = null, title = '', tag = '';
  if (slot === 'tactical') { flat = MP.TACTICALS; cur = L.tactical; title = 'Tactical'; tag = 'one, and it is not a weapon'; set = function (id) { L.tactical = id; }; }
  if (slot === 'lethal') { flat = MP.LETHALS; cur = L.lethal; title = 'Lethal'; tag = 'one, and it is'; set = function (id) { L.lethal = id; }; }
  if (slot === 'ability') { flat = MP.ABILITIES; cur = L.ability; title = 'Special ability'; tag = 'charged by playing, not by a clock'; set = function (id) { L.ability = id; }; }
  if (flat) {
    el.dname.textContent = title;
    el.tagline.textContent = tag;
    flat.forEach(function (t) {
      var right = t.charge ? (t.charge + ' charge') : (t.lvl ? ('rank ' + t.lvl) : '');
      var d = detailRow(t.name, t.blurb, right, { fitted: cur === t.id });
      pushRow(d, null, function () { set(t.id); mpSave(); paintSlots(); paintDetail(); ldNav(true); });
    });
    return;
  }

  /* ---- one of the five killstreak slots ---- */
  if (slot.indexOf('streak') === 0) {
    var n = +slot.slice(6);
    el.dname.textContent = 'Killstreak ' + (n + 1);
    el.tagline.textContent = 'five of them, and the kills do not carry over a death';
    MP.KILLSTREAKS.forEach(function (k) {
      var here = L.streaks[n] === k.id;
      var elsewhere = !here && L.streaks.indexOf(k.id) >= 0;
      var d = detailRow(k.name, k.blurb, k.cost + ' kills', { fitted: here, locked: elsewhere });
      pushRow(d, null, function () {
        if (elsewhere) { beep('back'); return; }
        L.streaks[n] = k.id; mpSave(); paintSlots(); paintDetail(); ldNav(true);
      }, elsewhere);
    });
    return;
  }

  /* ---- camo, against the primary's own progress ---- */
  if (slot === 'camo') {
    var pg2 = MP.gun(L.primary), pr2 = prog(L.primary);
    var lv2 = MP.levelOf(pr2), pres = MP.prestigeOf(pg2, pr2);
    var order = ['gold', 'platinum', 'diamond'];
    el.dname.textContent = 'Camo';
    el.tagline.textContent = 'earned on the ' + (pg2 ? pg2.name : 'primary');
    MP.CAMOS.forEach(function (c) {
      var locked = c.prestige
        ? (!pres || order.indexOf(pres) < order.indexOf(c.prestige))
        : (c.lvl || 0) > lv2;
      var right = c.prestige ? c.prestige : (c.lvl ? ('level ' + c.lvl) : '');
      var d = detailRow(c.name, c.prestige
        ? (MP.PRESTIGE.filter(function (p) { return p.id === c.prestige; })[0] || {}).need
        : '', right, { fitted: L.camo === c.id, locked: locked });
      pushRow(d, null, function () { L.camo = c.id; mpSave(); paintSlots(); paintDetail(); ldNav(true); }, locked);
    });
    return;
  }

  /* ---- the keychain, which only exists at diamond ---- */
  if (slot === 'keychain') {
    var gk = MP.gun(L.primary), prk = prog(L.primary);
    el.dname.textContent = 'Keychain';
    var dia = MP.prestigeOf(gk, prk) === 'diamond';
    el.tagline.textContent = dia ? 'hangs off the sling loop' : 'diamond on your primary opens this';
    if (!dia) {
      var dn = detailRow('Not yet', 'Take the ' + (gk ? gk.name : 'primary')
        + ' to diamond and it hangs a keychain off the sling loop, engraved how you like.', 'locked', { locked: true });
      pushRow(dn, null, null, true);
      return;
    }
    detailHead('Shape');
    MP.KEYCHAIN_SHAPES.forEach(function (k) {
      var on = L.keychain && L.keychain.shape === k.id;
      var d = detailRow(k.name, '', '', { fitted: on });
      pushRow(d, null, function () {
        L.keychain = { shape: k.id, metal: (L.keychain && L.keychain.metal) || 'brass' };
        mpSave(); paintSlots(); paintDetail(); ldNav(true);
      });
    });
    detailHead('Metal');
    MP.KEYCHAIN_METALS.forEach(function (m) {
      var on2 = L.keychain && L.keychain.metal === m.id;
      var d = detailRow(m.name, '', '', { fitted: on2 });
      pushRow(d, null, function () {
        L.keychain = { shape: (L.keychain && L.keychain.shape) || 'tag', metal: m.id };
        mpSave(); paintSlots(); paintDetail(); ldNav(true);
      });
    });
    detailHead('None');
    var dnone = detailRow('Take it off', '', '', { fitted: !L.keychain });
    pushRow(dnone, null, function () { L.keychain = null; mpSave(); paintSlots(); paintDetail(); ldNav(true); });
  }
}

/* ---- moving about ----
   Two columns and one cursor. Up and down walk whichever column has it;
   right and Enter hand it to the list, left and Escape give it back.
   `keep` holds the place in the list through a repaint, so fitting an
   attachment does not throw you back to the top of the optics. */
function ldNav(keep) {
  if (ld.side === 'list' && ldRows.length) {
    var out = function () { ld.side = 'slots'; ldNav(); };
    /* Assigned, not wrapped. Wrapping it built a new closure around the
       old one on every repaint, and fitting six attachments in a row
       left six of them stacked up waiting to fire. */
    ldRows.forEach(function (r) { r.onLeft = out; });
    navSet(ldRows, out, keep);
    return;
  }
  ld.side = 'slots';
  var rows = [];
  SLOT_ROWS.forEach(function (r) {
    if (!r._el) return;
    var srow = wire({
      el: r._el,
      onFocus: function () { if (ld.slot !== r.id) { ld.slot = r.id; paintDetail(); } },
      onEnter: function () { if (ldRows.length) { ld.side = 'list'; ldNav(); } else beep('back'); },
      onRight: function () { if (ldRows.length) { ld.side = 'list'; ldNav(); } },
    });
    srow._slotId = r.id;
    rows.push(srow);
  });
  /* Land on the slot that is actually selected rather than on the top
     of the list, so coming back from the lobby tab does not lose it --
     and set the index BEFORE navSet rather than after. Setting it after
     meant navSet painted row zero first, row zero's onFocus repainted
     the whole right-hand column for the primary, and the slot you were
     actually pointing at never got a look in. */
  var want = 0;
  for (var i = 0; i < rows.length; i++) if (rows[i]._slotId === ld.slot) { want = i; break; }
  nav.i = want;
  navSet(rows, openMain, true);
  el.mpfoot.innerHTML = '<div><b>&uarr;&darr;</b> move &nbsp; <b>&rarr; / Enter</b> into the list '
    + '&nbsp; <b>&larr; / Esc</b> back out &nbsp; <b>LB / RB</b> lobby and loadout</div>';
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
/* The multiplayer state as it stands in memory. Local storage is not
   readable at all on a page with no origin, so this is the only way a
   headless check can see what the loadout screen actually did. */
SHELL.mpState = function () { return mp; };
SHELL.beep = beep;

W.BUNKER_SHELL = SHELL;

})();
