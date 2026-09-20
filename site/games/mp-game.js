/* ==================================================================
   MULTIPLAYER, PLAYED
   ==================================================================
   The layer between a person and the match: what the keys do, where
   the camera is, and everything on the screen.

   mp-match.js owns the rules and knows nothing about pixels. This owns
   pixels and decides nothing about the rules -- it reads a keyboard and
   a mouse, turns them into intentions, and hands them to the match,
   which runs them through exactly the same functions a bot's decisions
   go through. That split is why a whole match can be simulated
   headless: nothing in the rules reaches for a screen.

   THE HUD IS BUILT OUT OF THE GAME'S OWN FURNITURE

   Georgia, bone white, and the amber the zombies HUD already uses for
   anything you can act on. It is the same game, so it looks like the
   same game.
   ================================================================== */

(function () {
  'use strict';

  var W = window;

  /* ---- keys ----
     Defaults, and for a long time the ONLY thing multiplayer read. The
     comment here used to say "so the rebinding work can point at it
     later", and later never came: the settings screen let you rebind
     every one of these, saved it, published it, and a match ignored
     the lot. Rebinding worked in zombies and nowhere else, which is
     worse than not offering it.

     `bindsFor` below folds whatever the player has saved over the top
     of this table. */
  var KEYS = {
    forward: ['w', 'arrowup'], back: ['s', 'arrowdown'],
    left: ['a', 'arrowleft'], right: ['d', 'arrowright'],
    jump: [' '], crouch: ['control', 'c'], sprint: ['shift'],
    slide: ['z'], reload: ['r'], swap: ['q', '1', '2'], scores: ['tab'],
    /* LOOK AT THE THING YOU ARE HOLDING. There was no way to: you could
       fire a weapon, reload it, sprint with it and swap off it, and
       never once see it. On a game whose argument is that the guns are
       modelled properly, that is the animation whose absence costs the
       most. */
    inspect: ['i'],
    quit: ['escape'],
  };

  /* WHICH ROW OF THE SETTINGS SCREEN DRIVES WHICH READER.
     The shell names its actions for the player; this file names them
     for the code, and nothing connected the two. */
  var BIND_TO_KEY = {
    fwd: 'forward', back: 'back', left: 'left', right: 'right',
    jump: 'jump', sprint: 'sprint', slide: 'slide', crouch: 'crouch',
    reload: 'reload', swap: 'swap', scores: 'scores', pause: 'quit',
    inspect: 'inspect',
  };

  /* A BINDING IS A PHYSICAL KEY, NOT A LETTER.
     The shell captures event.code, because that is the key somebody
     actually pressed; this file's reader has always matched on
     event.key, which is the letter that key produces. On a US layout
     they agree and everywhere else they do not, so translating one to
     the other would rebind the wrong key for anybody on AZERTY. The
     reader records BOTH instead, and a saved binding matches the
     code. */
  function bindsFor() {
    var out = {}, k;
    for (k in KEYS) if (Object.prototype.hasOwnProperty.call(KEYS, k)) out[k] = KEYS[k];
    var saved = null;
    try {
      saved = JSON.parse(W.localStorage.getItem('b9.settings.v1') || 'null');
    } catch (e) { saved = null; }
    var m = saved && saved.keyBinds;
    if (!m) return out;
    for (var id in m) {
      if (!Object.prototype.hasOwnProperty.call(m, id)) continue;
      var name = BIND_TO_KEY[id];
      if (!name || !m[id]) continue;
      out[name] = ['code:' + m[id]];
    }
    return out;
  }

  var CSS = `
#mpui { position:fixed; inset:0; z-index:40; pointer-events:none;
  font-family:Georgia,'Times New Roman',serif; color:#e8ddc8; letter-spacing:.05em;
  -webkit-font-smoothing:antialiased; }
#mpui .hide { display:none !important; }

/* ---- the crosshair ----
   Four ticks and a dot, and the gap between them is the gun's actual
   cone. It grows when you move and when you fire, so the thing on the
   screen is telling you the truth about where the next round goes
   rather than being a decoration in the middle of it. */
#mpui .cross { position:absolute; left:50%; top:50%; width:0; height:0; }
#mpui .cross i { position:absolute; background:#e8ddc8; opacity:.9;
  box-shadow:0 0 2px rgba(0,0,0,.9); }
#mpui .cross .dot { width:2px; height:2px; margin:-1px 0 0 -1px; }
#mpui .cross .up, #mpui .cross .dn { width:2px; height:9px; margin-left:-1px; }
#mpui .cross .lf, #mpui .cross .rt { width:9px; height:2px; margin-top:-1px; }
/* Hit: four short diagonals, and red when it finished them. */
#mpui .hit { position:absolute; left:50%; top:50%; width:0; height:0; opacity:0; }
#mpui .hit b { position:absolute; width:11px; height:2px; background:#fff;
  transform-origin:50% 50%; box-shadow:0 0 3px rgba(0,0,0,.9); }
#mpui .hit.on { opacity:1; transition:none; }
#mpui .hit.fade { opacity:0; transition:opacity .28s linear; }
#mpui .hit.kill b { background:#ff6a5a; }

/* ---- health, bottom left ---- */
#mpui .hp { position:absolute; left:34px; bottom:34px; width:210px; }
#mpui .hp .bar { position:relative; height:5px; background:rgba(0,0,0,.55);
  border:1px solid rgba(232,221,200,.30); }
#mpui .hp .bar i { position:absolute; left:0; top:0; bottom:0; background:#e8ddc8;
  transition:width .12s linear; }
#mpui .hp.low .bar i { background:#c8483c; }
#mpui .hp .n { font-size:26px; line-height:1; margin-bottom:7px;
  font-variant-numeric:tabular-nums; text-shadow:0 2px 6px rgba(0,0,0,.9); }
#mpui .hp .who { font-size:10.5px; letter-spacing:.24em; color:#9a9280;
  text-transform:uppercase; margin-top:7px; }

/* ---- the gun, bottom right ---- */
#mpui .gun { position:absolute; right:34px; bottom:30px; text-align:right;
  text-shadow:0 2px 6px rgba(0,0,0,.9); }
#mpui .gun .nm { font-size:12px; letter-spacing:.26em; text-transform:uppercase;
  color:#a89b80; }
#mpui .gun .ammo { font-size:34px; line-height:1.05; font-variant-numeric:tabular-nums; }
#mpui .gun .ammo small { font-size:17px; color:#8a8272; }
#mpui .gun .re { font-size:11px; letter-spacing:.22em; color:#ffd27a;
  text-transform:uppercase; min-height:14px; }

/* ---- the score, top centre ---- */
#mpui .top { position:absolute; left:50%; top:20px; transform:translateX(-50%);
  text-align:center; text-shadow:0 2px 6px rgba(0,0,0,.9); }
#mpui .top .sc { font-size:27px; letter-spacing:.14em; font-variant-numeric:tabular-nums; }
#mpui .top .sc .us { color:#8ce8a0; }
#mpui .top .sc .them { color:#e2705f; }
#mpui .top .sc .sp { color:#6b6455; margin:0 12px; font-size:19px; }
#mpui .top .clock { font-size:13px; letter-spacing:.24em; color:#c8bfa8;
  font-variant-numeric:tabular-nums; }
#mpui .top .mode { font-size:10px; letter-spacing:.30em; color:#6b6455;
  text-transform:uppercase; margin-top:3px; }
#mpui .top .bomb { font-size:12px; letter-spacing:.20em; color:#ffd27a;
  text-transform:uppercase; margin-top:5px; min-height:15px; }
#mpui .top .bomb.armed { color:#ff6a5a; }

/* ---- the killfeed, top right ---- */
#mpui .feed { position:absolute; right:30px; top:70px; width:330px; text-align:right; }
#mpui .feed div { font-size:12.5px; margin-bottom:4px; color:#c8bfa8;
  text-shadow:0 2px 5px rgba(0,0,0,.95); animation:mpfeed .3s ease; }
#mpui .feed b { font-weight:normal; }
#mpui .feed .us { color:#8ce8a0; } #mpui .feed .them { color:#e2705f; }
#mpui .feed .wp { color:#6b6455; font-style:italic; }
@keyframes mpfeed { from { opacity:0; transform:translateX(14px); } to { opacity:1; } }

/* ---- taking a hit: an arc on the edge of the screen pointing at it ---- */
#mpui .dmg { position:absolute; inset:0; }
#mpui .dmg i { position:absolute; left:50%; top:50%; width:0; height:0; opacity:0; }
#mpui .dmg i:before { content:""; position:absolute; left:-46px; top:-150px; width:92px;
  height:12px; background:radial-gradient(closest-side, rgba(226,112,95,.95), rgba(226,112,95,0));
  border-radius:50%; }

/* ---- dead ---- */
#mpui .dead { position:absolute; inset:0; display:flex; flex-direction:column;
  align-items:center; justify-content:center; background:rgba(12,6,5,.55); }
#mpui .dead h2 { margin:0; font-size:19px; font-weight:normal; letter-spacing:.30em;
  text-transform:uppercase; color:#e2705f; }
#mpui .dead .by { margin-top:13px; font-size:16px; letter-spacing:.08em; color:#c8bfa8; }
#mpui .dead .by b { color:#e8ddc8; font-weight:normal; }
#mpui .dead .in { margin-top:26px; font-size:11.5px; letter-spacing:.28em; color:#6b6455;
  text-transform:uppercase; }
#mpui .dead .n { font-size:42px; color:#ffd27a; font-variant-numeric:tabular-nums;
  line-height:1.2; }

/* ---- the scoreboard ---- */
#mpui .board { position:absolute; left:50%; top:50%; transform:translate(-50%,-50%);
  width:min(880px,92vw); background:rgba(9,8,6,.94); border:1px solid #4a4234;
  padding:18px 22px 20px; }
#mpui .board h3 { margin:0 0 12px; font-size:12px; letter-spacing:.30em; color:#6b6455;
  text-transform:uppercase; font-weight:normal; display:flex; }
#mpui .board h3 .sp { flex:1; }
#mpui .board table { width:100%; border-collapse:collapse; font-size:13.5px; }
#mpui .board th { text-align:right; font-weight:normal; font-size:10px; letter-spacing:.20em;
  color:#6b6455; text-transform:uppercase; padding:0 9px 6px; border-bottom:1px solid #2a251d; }
#mpui .board th:first-child, #mpui .board td:first-child { text-align:left; }
#mpui .board td { text-align:right; padding:5px 9px; border-bottom:1px solid #1b1813;
  font-variant-numeric:tabular-nums; }
#mpui .board tr.me td { color:#ffd27a; }
#mpui .board tr.a td:first-child { border-left:2px solid #8ce8a0; padding-left:9px; }
#mpui .board tr.b td:first-child { border-left:2px solid #e2705f; padding-left:9px; }
#mpui .board .bot { color:#5d5749; font-size:10px; letter-spacing:.18em; }
#mpui .board .foot { margin-top:14px; font-size:11px; letter-spacing:.20em; color:#5d5749;
  text-transform:uppercase; }
#mpui .board .foot b { color:#ffd27a; font-weight:normal; }

/* ---- the end ---- */
#mpui .over { position:absolute; inset:0; background:rgba(5,6,10,.86);
  display:flex; flex-direction:column; align-items:center; justify-content:center; }
#mpui .over .won { font-size:38px; letter-spacing:.24em; text-transform:uppercase; }
#mpui .over .won.us { color:#8ce8a0; } #mpui .over .won.them { color:#e2705f; }
#mpui .over .sub { margin-top:10px; font-size:12px; letter-spacing:.28em; color:#6b6455;
  text-transform:uppercase; }
#mpui .over .go { margin-top:28px; pointer-events:auto; cursor:pointer;
  border:1px solid #4a4234; padding:12px 30px; font-size:15px; letter-spacing:.26em;
  text-transform:uppercase; background:rgba(232,221,200,.04); }
#mpui .over .go:hover { border-color:#ffd27a; color:#ffd27a; }
#mpui .over .ends { display:flex; gap:14px; }
#mpui .over .ends .go { margin-top:28px; }
#mpui .over .ends .again { border-color:#6b7f5a; color:#cfe6bd; }
#mpui .over .ends .again:hover { border-color:#8ce8a0; color:#8ce8a0; }

/* ---- the replay: kill cam and best play ----
   Everything else on the HUD goes away while one of these runs. A kill
   cam with your own ammo count and crosshair over it is not a kill cam,
   it is your HUD with somebody else's camera behind it. */
#mpui.cam .cross, #mpui.cam .hit, #mpui.cam .dmg, #mpui.cam .top, #mpui.cam .feed,
#mpui.cam .hp, #mpui.cam .gun, #mpui.cam .dead, #mpui.cam .board, #mpui.cam .over,
#mpui.cam .lock { display:none !important; }

#mpui .cam { position:absolute; inset:0; }
/* Letterbox. It is the cheapest possible way of saying "this is not
   you playing" and it is instantly understood. */
#mpui .cam .lb { position:absolute; left:0; right:0; height:9%; background:#05060a;
  transition:height .25s ease; }
#mpui .cam .lb.t { top:0; } #mpui .cam .lb.b { bottom:0; }
#mpui .cam .lab { position:absolute; left:0; right:0; top:12%; text-align:center; }
#mpui .cam .kind { font-size:11px; letter-spacing:.42em; text-transform:uppercase;
  color:#8a806c; }
#mpui .cam .nm { margin-top:8px; font-size:31px; letter-spacing:.14em; color:#ffd27a;
  text-shadow:0 2px 14px rgba(0,0,0,.85); }
#mpui .cam .det { margin-top:7px; font-size:12px; letter-spacing:.2em; color:#c8bfa8;
  text-transform:lowercase; }
#mpui .cam .skip { position:absolute; right:26px; bottom:calc(9% + 18px); font-size:11px;
  letter-spacing:.24em; text-transform:uppercase; color:#6b6455; }
#mpui .cam .skip b { color:#c8bfa8; font-weight:normal; }
#mpui .cam .prog { position:absolute; left:26px; right:26px; bottom:calc(9% + 12px);
  height:1px; background:rgba(232,221,200,.16); }
#mpui .cam .prog i { display:block; height:100%; width:0; background:#ffd27a; }

/* ---- THE ARROW THAT SAYS YOU ----
   A kill cam is somebody else's screen, and the single hardest thing
   about watching one is working out which of the twelve men on it is
   the one who just died. This marks you: a label and a downward arrow
   standing over your own head, wherever it is, for the whole clip.

   Positioned from Engine.project, which is why it can exist at all --
   until that landed there was no way to turn a world point into a
   screen point and every marker in the game was a dot in the middle. */
#mpui .cam .you { position:absolute; left:0; top:0; z-index:12;
  transform:translate(-50%, -100%); text-align:center; pointer-events:none;
  transition:opacity .18s linear; }
#mpui .cam .you b { display:block; font-size:11px; letter-spacing:.34em;
  font-weight:normal; color:#ffd27a; text-shadow:0 1px 5px rgba(0,0,0,.95),
  0 0 12px rgba(255,210,122,.45); }
#mpui .cam .you i { display:block; width:0; height:0; margin:3px auto 0;
  border-left:6px solid transparent; border-right:6px solid transparent;
  border-top:9px solid #ffd27a;
  filter:drop-shadow(0 1px 4px rgba(0,0,0,.9)); }

/* ---- settings ----
   Multiplayer read invertX and invertY out of storage and had no way
   on earth to SET them. Somebody whose stick is the wrong way round
   could do nothing about it but tell me, repeatedly, while I guessed
   at the sign and got it wrong. A switch ends that argument. */
#mpui .opt { position:absolute; inset:0; background:rgba(5,6,10,.78);
  display:flex; align-items:center; justify-content:center; pointer-events:auto; }
#mpui .opt .pane { width:min(560px,92vw); border:1px solid #3a3428;
  background:rgba(12,13,17,.97); padding:26px 30px 22px; }
#mpui .opt h3 { margin:0 0 18px; font-size:13px; letter-spacing:.34em;
  text-transform:uppercase; color:#8a806c; font-weight:normal; }
#mpui .opt .row { display:flex; align-items:center; justify-content:space-between;
  padding:11px 0; border-top:1px solid #23201a; }
#mpui .opt .row:first-of-type { border-top:0; }
#mpui .opt .row .t { font-size:14px; letter-spacing:.06em; color:#e8ddc8; }
#mpui .opt .row .t small { display:block; margin-top:3px; font-size:11px;
  letter-spacing:.10em; color:#6b6455; text-transform:none; }
#mpui .opt button { pointer-events:auto; cursor:pointer; font:inherit;
  border:1px solid #4a4234; background:rgba(232,221,200,.04); color:#c8bfa8;
  padding:7px 16px; font-size:12px; letter-spacing:.20em; text-transform:uppercase; }
#mpui .opt button:hover { border-color:#ffd27a; color:#ffd27a; }
#mpui .opt button.on { border-color:#8ce8a0; color:#8ce8a0; }
#mpui .opt .keys { display:flex; gap:8px; }
#mpui .opt .go { margin-top:20px; display:flex; gap:10px; justify-content:flex-end; }

/* ---- the pad's own pointer ----
   A controller cannot press a button that only answers to a mouse, and
   the end-of-match screen is exactly that: Play Again and Return to
   Lobby were click handlers and nothing else, so a pad player reaching
   the end of a match was stuck there.

   Rather than bolt focus navigation onto one screen, the pad gets a
   pointer of its own. It can press anything the mouse can press,
   anywhere in the game, including every pane written before it
   existed. Toggled with all four directions of the D-pad at once --
   a deliberate chord, because it must never happen by accident in a
   firefight -- and it says which state it is in, in the corner. */
#mpui .curs { position:absolute; left:0; top:0; width:26px; height:26px;
  margin:-2px 0 0 -2px; pointer-events:none; z-index:60;
  transition:opacity .12s linear; }
#mpui .curs svg { display:block; filter:drop-shadow(0 1px 3px rgba(0,0,0,.9)); }
#mpui .curs.press svg { transform:scale(.82); transform-origin:2px 2px; }
#mpui .padbadge { position:absolute; right:18px; top:16px; font-size:10px;
  letter-spacing:.26em; text-transform:uppercase; color:#6b6455;
  border:1px solid #3a3428; padding:5px 10px; background:rgba(5,6,10,.6); }
#mpui .padbadge b { color:#ffd27a; font-weight:normal; }

/* ---- the mouse-look hint ----
   Not a gate. The match is already running behind it: this only says
   the mouse is not captured yet, and it never eats a click. */
#mpui .lock { position:absolute; left:0; right:0; bottom:74px; display:flex;
  justify-content:center; pointer-events:none; text-align:center; z-index:58;
  transition:opacity .45s linear; }
#mpui .lock.fade { opacity:0; }
#mpui .lock div { max-width:640px; font-size:10.5px; letter-spacing:.20em;
  text-transform:uppercase; color:#9a927f; line-height:1.9;
  background:rgba(5,6,10,.62); border:1px solid #2c2820; padding:6px 14px; }
#mpui .lock b { color:#ffd27a; font-weight:normal; }
`;

  var MARKUP = `
  <div class="cross"><i class="dot"></i><i class="up"></i><i class="dn"></i>
    <i class="lf"></i><i class="rt"></i></div>
  <div class="hit"><b></b><b></b><b></b><b></b></div>
  <div class="dmg"></div>
  <div class="top">
    <div class="sc"><span class="us">0</span><span class="sp">&ndash;</span><span class="them">0</span></div>
    <div class="clock">10:00</div>
    <div class="mode"></div>
    <div class="bomb"></div>
  </div>
  <div class="feed"></div>
  <div class="hp"><div class="n">100</div><div class="bar"><i></i></div><div class="who"></div></div>
  <div class="gun"><div class="nm">&mdash;</div>
    <div class="ammo"><span class="m">30</span><small> / <span class="r">180</span></small></div>
    <div class="re"></div></div>
  <div class="dead hide"><h2>You are down</h2>
    <div class="by"></div><div class="in">Back in</div><div class="n">5</div></div>
  <div class="board hide"></div>
  <div class="over hide"></div>
  <div class="cam hide"><div class="lb t"></div><div class="lb b"></div>
    <div class="lab"><div class="kind"></div><div class="nm"></div><div class="det"></div></div>
    <div class="prog"><i></i></div>
    <div class="you hide"><b>YOU</b><i></i></div>
    <div class="skip">press <b>Space</b> to skip</div></div>
  <div class="opt hide"><div class="pane">
    <h3>Settings</h3>
    <div class="row"><div class="t">Invert look &mdash; vertical
      <small>Push the stick up and the view goes down.</small></div>
      <button data-t="invertY">Off</button></div>
    <div class="row"><div class="t">Invert look &mdash; horizontal
      <small>Push the stick right and the view goes left.</small></div>
      <button data-t="invertX">Off</button></div>
    <div class="row"><div class="t">Stick sensitivity
      <small>How fast the right stick turns you.</small></div>
      <div class="keys"><button data-s="-">&minus;</button>
        <button class="val" disabled>1.0</button>
        <button data-s="+">+</button></div></div>
    <div class="row"><div class="t">Mouse sensitivity
      <small>Keyboard and mouse only.</small></div>
      <div class="keys"><button data-m="-">&minus;</button>
        <button class="mval" disabled>1.0</button>
        <button data-m="+">+</button></div></div>
    <div class="row"><div class="t">Graphics
      <small>Drops on its own if the frame rate cannot keep up.</small></div>
      <div class="keys"><button data-g="low">Low</button>
        <button data-g="normal">Normal</button>
        <button data-g="high">High</button></div></div>
    <div class="go"><button class="quit">Leave match</button>
      <button class="resume">Back to the game</button></div>
  </div></div>
  <div class="curs hide"><svg width="26" height="26" viewBox="0 0 26 26">
    <path d="M2,2 L2,19 L7,14.6 L10.4,22.4 L13.6,21 L10.2,13.4 L16.6,13.2 Z"
      fill="#ffd27a" stroke="#1a1408" stroke-width="1.4" stroke-linejoin="round"/></svg></div>
  <div class="padbadge hide">pointer <b>on</b></div>
  <div class="lock"><div>Click anywhere for mouse look</div></div>
`;

  /* ================================================================
     INPUT
     ================================================================
     Held keys in a set, mouse deltas accumulated between frames. The
     pointer lock is the whole of the mouse look: without it the cursor
     hits the edge of the window and the aim stops, which is the one
     thing that makes a browser shooter feel broken. */

  function makeInput(root, canvas) {
    var down = {}, mdx = 0, mdy = 0, locked = false, unlockHook = null;
    var buttons = { fire: false, aim: false };
    var pressed = {};
    /* The match runs whether or not the browser has given us the mouse.
       There is no plate to click through -- the hint fades on its own,
       and the first click anywhere that is not a menu grabs the mouse.
       A pad never needs it at all. */
    var hintT = null, wantLock = true;
    function hint() { return root.querySelector('.lock'); }
    function showHint() {
      var h = hint(); if (!h) return;
      h.classList.remove('hide'); h.classList.remove('fade');
      if (hintT) clearTimeout(hintT);
      hintT = setTimeout(function () { var e = hint(); if (e) e.classList.add('fade'); }, 6000);
    }
    function hideHint() {
      var h = hint(); if (h) h.classList.add('hide');
      if (hintT) { clearTimeout(hintT); hintT = null; }
    }
    function grab() {
      if (locked || !wantLock) return;
      /* A menu is open, or the match is over and the buttons want the
         cursor: taking the mouse away would be the bug, not the fix. */
      if (root.querySelector('.opt') && !root.querySelector('.opt').classList.contains('hide')) return;
      if (root.classList.contains('done')) return;
      if (canvas.requestPointerLock) { try { canvas.requestPointerLock(); } catch (e) { /* refused */ } }
    }

    function name(e) {
      var k = e.key.toLowerCase();
      if (k === 'control' || k === 'ctrl') return 'control';
      return k;
    }
    /* Both the letter and the physical key, under two names in the same
       map, so a default written as 'w' and a binding saved as
       'code:KeyW' are read by exactly the same `any`. */
    function keyDown(e) {
      var k = name(e), c = e.code ? 'code:' + e.code : null;
      if (!down[k]) pressed[k] = true;
      down[k] = true;
      if (c) { if (!down[c]) pressed[c] = true; down[c] = true; }
      if (k === 'tab' || k === ' ' || k.indexOf('arrow') === 0) e.preventDefault();
    }
    function keyUp(e) {
      down[name(e)] = false;
      if (e.code) down['code:' + e.code] = false;
    }
    function move(e) {
      if (!locked) return;
      mdx += e.movementX || 0;
      mdy += e.movementY || 0;
    }
    function mdown(e) {
      if (!locked) { if (e.button === 0) grab(); return; }
      if (e.button === 0) buttons.fire = true;
      if (e.button === 2) buttons.aim = true;
      e.preventDefault();
    }
    function mup(e) {
      if (e.button === 0) buttons.fire = false;
      if (e.button === 2) buttons.aim = false;
    }
    function lockChange() {
      var was = locked;
      locked = document.pointerLockElement === canvas;
      if (locked) hideHint(); else showHint();
      if (!locked) { buttons.fire = false; buttons.aim = false; }
      /* The browser takes the pointer lock away on Escape whether the
         page likes it or not, so that IS the pause: whoever wants to
         know gets told. */
      if (was && !locked && unlockHook) unlockHook();
    }

    W.addEventListener('keydown', keyDown);
    W.addEventListener('keyup', keyUp);
    W.addEventListener('mousemove', move);
    W.addEventListener('mousedown', mdown);
    W.addEventListener('mouseup', mup);
    W.addEventListener('contextmenu', function (e) { if (locked) e.preventDefault(); });
    document.addEventListener('pointerlockchange', lockChange);
    showHint();

    function any(list) {
      for (var i = 0; i < list.length; i++) if (down[list[i]]) return true;
      return false;
    }
    function once(list) {
      for (var i = 0; i < list.length; i++) if (pressed[list[i]]) return true;
      return false;
    }
    return {
      any: any, once: once, buttons: buttons,
      get locked() { return locked; },
      onUnlock: function (fn) { unlockHook = fn; },
      take: function () { var d = [mdx, mdy]; mdx = 0; mdy = 0; return d; },
      endFrame: function () { pressed = {}; },
      /* A test has no mouse and no pointer lock. This is how it drives
         the same code a person does, rather than a second path that is
         the only one ever exercised. */
      _press: function (k) { down[k] = true; pressed[k] = true; },
      _release: function (k) { down[k] = false; },
      _look: function (dx, dy) { mdx += dx; mdy += dy; },
      _lock: function (v) { locked = v; if (v) hideHint(); else showHint(); },
      /* The end screen wants the cursor. Nothing may steal it back. */
      wantLock: function (v) { wantLock = v; if (!v) hideHint(); },
      grab: grab,
      dispose: function () {
        W.removeEventListener('keydown', keyDown); W.removeEventListener('keyup', keyUp);
        W.removeEventListener('mousemove', move); W.removeEventListener('mousedown', mdown);
        W.removeEventListener('mouseup', mup);
        document.removeEventListener('pointerlockchange', lockChange);
        if (hintT) clearTimeout(hintT);
      },
    };
  }

  /* ================================================================
     THE PAD
     ================================================================
     A controller is not a keyboard with different key names. Two
     things make the difference between a pad that works and one that
     is merely connected:

     A DEADZONE THAT IS RADIAL, not per axis. Per-axis deadzones are why
     a stick pushed diagonally feels like it snaps to the diagonals --
     each axis crosses its threshold separately. One radial test on the
     magnitude, and then the remaining travel is rescaled so the very
     first movement past the deadzone is the slowest and not a jump.

     A RESPONSE CURVE on the look stick. Linear look is unusable: you
     get either a stick too slow to turn round or one too fast to aim.
     Cubed, with a linear part mixed back in, gives fine control in the
     middle of the travel and a real turn at the edge -- and it is one
     line rather than a sensitivity slider people have to find.

     The button numbers are the standard mapping. On a pad the browser
     does not recognise, the axes still work and the face buttons fall
     back to "any of the first four", which is worth more than nothing.
     ================================================================ */

  var PAD = {
    fire: 7, aim: 6,            // right and left trigger
    jump: 0, crouch: 1, reload: 2, swap: 3,
    sprint: 10, slide: 11,      // stick clicks
    scores: 8, quit: 9,
    lb: 4, rb: 5,
  };
  /* Published so a test can press the buttons this table names rather
     than a copy of it. engine/test/mppad.test.js gives the reason at
     length: multiplayer has its own input layer, separate from the
     zombies one, and a second copy of these numbers would agree with
     itself while the game moved on -- which is exactly how the Thompson
     ended up as two different weapons. */
  W.MP_PAD = PAD;

  function stick(x, y, dz) {
    var m = Math.hypot(x, y);
    if (m < dz) return [0, 0, 0];
    /* Rescaled from the edge of the deadzone, so the first movement
       past it is slow rather than a jump to `dz` worth of speed. */
    var t = Math.min(1, (m - dz) / (1 - dz));
    return [(x / m) * t, (y / m) * t, t];
  }

  function curve(v) {
    var a = Math.abs(v);
    return Math.sign(v) * (a * a * a * 0.78 + a * 0.22);
  }

  function makePad(opts) {
    var prev = {}, live = null;
    var dzL = opts.deadzoneLeft != null ? opts.deadzoneLeft : 0.18;
    var dzR = opts.deadzoneRight != null ? opts.deadzoneRight : 0.16;
    /* Read live rather than captured, so changing any of these applies
       on the next frame instead of on the next match. There was no
       invert at all, which is not a preference a shooter can decline to
       have -- a good half of people play inverted and for them the game
       is unplayable without it. */
    function cfg() {
      var c = null;
      try { c = JSON.parse(W.localStorage.getItem('b9.pad.v1') || 'null'); } catch (e) { c = null; }
      return c || {};
    }
    var conf = cfg();
    var reread = 0;

    function read() {
      if (!W.navigator || !navigator.getGamepads) return null;
      var pads = navigator.getGamepads() || [];
      for (var i = 0; i < pads.length; i++) {
        if (pads[i] && pads[i].connected) return pads[i];
      }
      return null;
    }
    function down(p, i) {
      var b = p.buttons || [];
      return !!(b[i] && (b[i].pressed || b[i].value > 0.45));
    }
    return {
      get pad() { return live; },
      /* Rumble, when the pad has it. A hit you can feel is worth more
         than a hit marker you have to notice. */
      rumble: function (strong, seconds) {
        var a = live && live.vibrationActuator;
        if (!a || !a.playEffect) return;
        try {
          a.playEffect('dual-rumble', { duration: Math.round(seconds * 1000),
            strongMagnitude: strong, weakMagnitude: strong * 0.6 });
        } catch (e) { /* a pad that will not buzz still plays */ }
      },
      /* The raw device, for the pointer -- which has to work on screens
         where nothing is reading commands at all, which is every screen
         after the match has ended. */
      raw: function () { return read(); },
      config: function () { return conf; },
      setConfig: function (c) {
        conf = Object.assign({}, conf, c || {});
        try { W.localStorage.setItem('b9.pad.v1', JSON.stringify(conf)); } catch (e) { /* off */ }
        return conf;
      },
      poll: function (dt, cmd) {
        var p = live = read();
        if (!p) return false;
        reread += dt;
        if (reread > 0.5) { reread = 0; conf = cfg(); }
        var look = (conf.sensitivity || opts.padSensitivity || 1) * 3.4;
        var invY = conf.invertY ? -1 : 1;
        var invX = conf.invertX ? -1 : 1;
        var ax = p.axes || [];
        var L = stick(ax[0] || 0, ax[1] || 0, dzL);
        var R = stick(ax[2] || 0, ax[3] || 0, dzR);
        /* Move: the stick adds to whatever the keyboard already said,
           so both work at once and neither cancels the other. */
        cmd.right += L[0];
        cmd.forward += -L[1];
        var m = Math.hypot(cmd.forward, cmd.right);
        if (m > 1) { cmd.forward /= m; cmd.right /= m; }
        /* Positive pitch looks DOWN in this camera, and the stick
           reports negative when pushed up -- so the default is already
           right way round and `invertY` flips it for the people who
           want it flipped. Written down because it is the single
           easiest sign in the codebase to get backwards. */
        cmd.lookX = -curve(R[0]) * look * dt * invX;
        cmd.lookY = curve(R[1]) * look * dt * invY;

        /* TREAT IT AS STANDARD UNLESS IT CANNOT BE.
         *
           This trusted `p.mapping === 'standard'`, and a great many
           real controllers report an EMPTY mapping string in a browser
           that has not seen their vendor id before -- an Xbox pad over
           Bluetooth, most third-party pads, anything through an
           adapter. Every one of those fell into the else branch below,
           where the only thing wired up is "any of the first four
           buttons fires". No aim, no jump, no reload, no sprint, no
           sliding. That is "the controls are completely not right",
           and it was one string comparison.

           A device with sixteen buttons and four axes IS the standard
           layout whatever it calls itself -- that is what the layout
           is. The else branch is now only for genuinely strange
           hardware, and it does as much as it safely can. */
        var b = p.buttons || [];
        var std = p.mapping === 'standard' || (b.length >= 15 && ax.length >= 4);
        function edge(name, on) { var was = !!prev[name]; prev[name] = on; return on && !was; }
        var trig = function (i) { return b[i] ? b[i].value : 0; };

        if (std) {
          cmd.fire = cmd.fire || trig(PAD.fire) > 0.35;
          cmd.aim = cmd.aim || trig(PAD.aim) > 0.35;
          cmd.jump = cmd.jump || edge('jump', down(p, PAD.jump));
          cmd.crouch = cmd.crouch || down(p, PAD.crouch);
          cmd.reload = cmd.reload || edge('reload', down(p, PAD.reload));
          /* HELD, NOT TAPPED, is the inspect -- the convention every
             pad shooter uses, and it costs no button on a layout that
             has none spare. The held state goes out raw and the frame
             loop times it, because the pad layer does not know how long
             a frame was. */
          cmd.reloadHeld = cmd.reloadHeld || down(p, PAD.reload);
          cmd.swap = cmd.swap || edge('swap', down(p, PAD.swap));
          cmd.run = cmd.run || down(p, PAD.sprint);
          cmd.slide = cmd.slide || edge('slide', down(p, PAD.slide));
          cmd.scores = cmd.scores || down(p, PAD.scores);
        } else {
          /* Genuinely strange hardware: fewer than fifteen buttons, so
             the standard indices cannot be assumed. Bind what is nearly
             always in the same place anyway rather than leaving the
             player with one button. */
          cmd.fire = cmd.fire || trig(7) > 0.35 || down(p, 7) || down(p, 5);
          cmd.aim = cmd.aim || trig(6) > 0.35 || down(p, 6) || down(p, 4);
          cmd.jump = cmd.jump || edge('jump', down(p, 0));
          cmd.crouch = cmd.crouch || down(p, 1);
          cmd.reload = cmd.reload || edge('reload', down(p, 2));
          cmd.swap = cmd.swap || edge('swap', down(p, 3));
        }
        return true;
      },
    };
  }

  /* ================================================================
     THE VIEWMODEL
     ================================================================
     THE REAL GUN, and until now it was ten boxes.

     This built a rifle out of a receiver-shaped box, a butt-shaped box,
     a grip, a magazine, a handguard, a barrel, two sights and two hands
     -- while the engine was carrying fifty-seven fully modelled weapons
     with rifled muzzles, checkered grips, working sights and individual
     brass rounds visible through smoked magazines. Multiplayer used
     none of them. "The gun models are a bunch of see-through shapes"
     is exactly right, and they were not even see-through by accident:
     ten separate boxes floating a few centimetres apart is what that
     looks like from the inside.

     So: the actual model, by id, cached per gun, placed in the camera's
     frame with the same geometry the zombies viewmodel uses -- which is
     worth reusing rather than re-deriving, because the hip cant in it
     is a measured number and getting it wrong is what "he holds his gun
     way too high" was. */

  /* A dozen guns have hand-built models instead of table entries, so the
     table cannot be the only place this looks. Anything with no model
     at all falls back to the nearest thing that does, because a missing
     gun should be the wrong gun and not an empty hand.

     THIS MAP IS THE WHOLE BUG. A hand-built model that is not listed
     here is not "unused" in a harmless way -- the lookup silently falls
     through to serviceArm, and the player gets a generic arm wearing the
     right name. "The Thompson is completely wrong" was exactly that: a
     351-line Thompson sat in 97-thompson.js while the game drew a
     table-built stand-in. Worse, `remington`, `killstreak` and
     `riotshield` have no service kind either, so they fell all the way
     through to the m4 -- a bolt-action sniper rifle and an anti-materiel
     rifle were both being drawn as a carbine.

     So: every Engine.prototype gun builder belongs in here, keyed by the
     MP_DATA weapon id (which is not always the builder's name --
     `remington` the weapon, `remington700` the builder). */
  var VM_BESPOKE = { mp5: 'mp5', m1911: 'pistol1911', model5: 'model5',
    mauser: 'mauserC96', breakwater: 'breakwater', scatter: 'scattergun',
    sawnoff: 'sawnOff', thompson: 'thompson', mg42: 'mg42',
    remington: 'remington700', killstreak: 'killStreak',
    riotshield: 'riotShield' };
  /* Nothing borrows a model any more. The fallback stays because a new
     id added to MP_DATA before its model exists should still put
     something in the player's hands. */
  var VM_FALLBACK = {};
  /* PUBLISHED, because mp-match builds the SAME weapon for the man
     across the street and was reaching straight for serviceArm -- so
     the hand-built models were in your hands and not in his. One map,
     one place, exported rather than copied: a duplicate would agree
     with itself while the two representations diverged, which is how
     this diverged in the first place. */
  W.MP_VM_BESPOKE = VM_BESPOKE;

  /* WHERE THE HANDS GO ON A WEAPON THAT HAS NEVER BEEN POSED.
   *
     Zombies authors a `hands` block per weapon -- the exact anchor for
     each palm and how the fingers close. Multiplayer has sixty guns and
     no such table, and waiting for sixty authored grips is waiting
     forever, so these are DERIVED from what the model measures about
     itself: muzzleAt is how far the muzzle is from the origin and
     boreAt is how high the bore sits above it.

     The firing hand is at the grip, which on every one of these models
     is within a couple of centimetres of the origin. The support hand
     goes two thirds of the way out the forend at about half bore
     height -- far enough forward to read as a hold, short of the muzzle
     so nobody is gripping a hot barrel. A pistol gets the wrapped
     support hand instead, thumb stacked behind the other, which is how
     a pistol is actually held with two hands.

     Authored anchors would be better and these are not a substitute for
     them. They are the difference between hands and no hands. */
  var PISTOL_WRAP = { axis: [-0.28, -0.94, 0], round: [0, 0, 1], girth: 0.078,
    spread: 0.0184, close: 0.90, index: 'wrap', thumb: 'stack', drop: 0 };

  function handsFor(g, cls) {
    var muzzle = (g && g.muzzleAt != null) ? g.muzzleAt : 0.42;
    var bore = (g && g.boreAt != null) ? g.boreAt : 0.05;
    var oneHanded = cls === 'pistol' || muzzle < 0.24;
    if (oneHanded) {
      return { right: [-0.004, -0.020, 0.017], rightGrip: 'pistol',
        left: [0.006, -0.030, -0.034], leftGrip: PISTOL_WRAP };
    }
    /* Short of the muzzle by a hand's width, whatever the weapon is --
       a two-thirds rule alone puts the support hand off the end of a
       submachine gun and halfway down the barrel of a rifle. */
    var fore = Math.max(0.12, Math.min(muzzle * 0.66, muzzle - 0.10));
    return { right: [-0.006, -0.024, 0.016], rightGrip: 'pistol',
      left: [fore, bore * 0.42, 0], leftGrip: 'fore' };
  }

  /* WHAT SIXTY GUNS SOUND LIKE.
   *
     Multiplayer was SILENT. Not thin, not sharing sounds -- there was
     not one call into the audio engine anywhere in mp-game.js or
     mp-match.js. Zombies has a hand-authored voice per weapon and
     eighteen weapons to author; this side has sixty, and waiting for
     sixty authored voices is waiting forever, so these are DERIVED
     from what MP_DATA already knows about each gun -- the same bargain
     handsFor makes for grips.

     MUZZLE VELOCITY IS THE ONE THAT MATTERS. A supersonic bullet drags
     a shock cone behind it and that crack is most of what you hear
     downrange; a subsonic one has none at all, which is why a .45 out
     of a 1911 (253 m/s) is a flat thump and a 7.92 out of an FG 42
     (740 m/s) is a whip. Sound in air is about 343 m/s and the table
     has `mv` on every row, so the crack simply switches itself on at
     the right place instead of being a per-gun opinion.

     Bore -- how big the report is -- comes off the charge rather than
     the calibre: damage times velocity is close enough to muzzle
     energy for this, and it puts a Kar98k above an MP5 and a Barrett
     above both, which is the order your ear expects.

     Everything else falls out: a big charge means a lower, longer
     body and a longer room tail; an open-bolt subgun means a loud
     mechanical clatter (the Thompson's bolt is half of what you hear);
     and minGap comes off the rate of fire so a gun at 1150 rpm is not
     rate-limited into a stutter by a guard written for a rifle. */
  var VOICES = {};
  function voiceFor(spec) {
    if (!spec) return null;
    if (VOICES[spec.id]) return VOICES[spec.id];
    var mv = spec.mv || 400, cls = spec.cls || 'assault';
    var shotgun = (W.MP_DATA && W.MP_DATA.SHOTGUNS || []).indexOf(spec.id) >= 0;
    var launcher = cls === 'launcher';
    /* Energy in arbitrary units, normalised so a 9 mm subgun lands
       near 0.2 and a .50 BMG near 1. */
    var energy = ((spec.dmg || 25) * mv) / 42000;
    var bore = Math.max(0.12, Math.min(1, energy));
    if (shotgun) bore = 0.92;
    if (launcher) bore = 1.0;
    /* The supersonic crack, off before 340 m/s and saturating well
       above it. Nothing subsonic gets one. */
    var sup = Math.max(0, Math.min(1, (mv - 340) / 430));
    var crack = shotgun ? 0.45 : (0.28 + sup * 0.95);
    var crackHz = Math.max(1200, Math.min(3800, 1400 + (mv - 250) * 2.9));
    /* Open-bolt blowback subguns clatter; a closed-bolt one does not.
       This was derived from muzzle velocity -- `cls === 'smg' && mv <
       420` -- which is not a fact about the action at all: the MP5
       fires the same 9 mm at the same 400 m/s as an MP 40, and came
       out with the MP 40's clatter. Whether the bolt is closed when
       the trigger breaks is a DESIGN decision, not something the
       ballistics can be asked about, and the MP5's is the whole reason
       it is the accurate one.

       The table already groups it: `fam: 'trench'` is exactly the
       open-bolt wartime generation -- Thompson, Grease Gun, Sten, MP
       40, PPSh -- while 'hk', 'modern' and 'machpistol' are all
       closed-bolt. So ask the family. Caught by mpsound.test.js, which
       exists because a derivation that quietly gives two guns the same
       voice looks exactly like one that works. */
    var openBolt = spec.fam === 'trench' || spec.fam === 'belt' || spec.fam === 'bipod';
    var mech = launcher ? 0 : (openBolt ? 0.52 : (cls === 'pistol' ? 0.30 : 0.22));
    var dur = 0.09 + bore * 0.30;
    VOICES[spec.id] = [bore, {
      crack: crack,
      crackHz: crackHz,
      crackLen: 0.024 + bore * 0.045,
      bodyHz0: Math.round(2000 - bore * 900),
      bodyHz1: Math.round(420 - bore * 320),
      thump: 0.40 + bore * 0.80,
      thumpHz: Math.round(180 - bore * 110),
      dur: dur,
      mech: mech,
      mechHz: openBolt ? 1500 : 2800,
      mechLen: openBolt ? 0.060 : 0.035,
      tail: 0.12 + bore * 0.40,
      tailHz: Math.round(1900 - bore * 1100),
      tailLen: 0.20 + bore * 1.4,
      /* A shot every 60/rpm seconds; the guard has to sit under that
         or the fastest guns lose every other report. */
      minGap: Math.max(0.012, Math.min(0.05, (60 / (spec.rpm || 600)) * 0.55)),
    }];
    return VOICES[spec.id];
  }

  /* THE GARAND'S PING.
   *
     The M1 is loaded with an eight-round en-bloc clip, and when the
     last round goes the clip itself is thrown out of the top of the
     receiver by its own spring -- the one mechanical noise in small
     arms that everybody can identify. It is the last item on the
     moving-parts list and it belongs to exactly one weapon: the SVT-40
     and the Brecher 59 are in the same family in the table but both
     feed from detachable boxes, so neither has anything to eject. */
  function fireSound(game, spec, emptied) {
    if (!game || !game.audio || !spec) return;
    var v = voiceFor(spec);
    try {
      if (v) game.audio.report(v[0], v[1]);
      /* After the shot, not with it -- the clip does not leave until
         the bolt has run back. */
      if (emptied && spec.id === 'garand') {
        game.audio.ping({ delay: 0.085, frequency: 2180, volume: 0.30 });
      }
    } catch (e) { /* audio is never worth dropping a frame for */ }
  }

  /* THE REST OF THE FIGHT.
   *
     Giving the player's own weapon a voice left multiplayer stranger
     than it was silent: you could hear yourself and nothing else. Five
     other people shooting at you across a map made no sound at all, so
     there was no way to tell where fire was coming from, or that it
     was coming at all until your health moved.

     THE ENGINE'S AUDIO IS 2D. There is no panner in it, so this cannot
     do direction -- what it can do is distance, and distance is most
     of what matters for gunfire: whether that was close. Two things
     fall off with range and they fall off differently.

       LOUDNESS goes as inverse square, softened here to 1/(1+(d/8)^2)
       because a strict inverse square makes everything past twenty
       metres inaudible and a game is not an anechoic chamber.

       BRIGHTNESS goes faster. Air absorbs high frequencies far more
       than low ones, which is why a rifle at ten metres cracks and the
       same rifle across a valley thumps. So the crack -- the
       supersonic snap, which is a local phenomenon anyway, heard only
       near the bullet's path -- is cut hard with range, the body is
       dragged downward, and the room tail is lengthened.

     Without the second part every distant shot sounds like a close one
     played quietly, which reads as a bug rather than as distance. */
  var HEAR = 8.0;                       // metres to half loudness
  function distant(spec, d) {
    var v = voiceFor(spec);
    if (!v) return null;
    var att = 1 / (1 + (d / HEAR) * (d / HEAR));
    if (att < 0.012) return null;       // below this nobody hears it
    /* Brightness falls off faster than loudness. */
    var bright = 1 / (1 + (d / (HEAR * 0.55)) * (d / (HEAR * 0.55)));
    var o = v[1], far = {};
    for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) far[k] = o[k];
    far.volume = att;
    far.crack = o.crack * bright * bright;
    far.crackHz = Math.max(900, o.crackHz * (0.45 + bright * 0.55));
    far.bodyHz0 = Math.max(260, o.bodyHz0 * (0.35 + bright * 0.65));
    far.bodyHz1 = Math.max(90, o.bodyHz1 * (0.5 + bright * 0.5));
    far.thump = o.thump * (0.7 + (1 - bright) * 0.5);
    far.tail = o.tail * (1 + (1 - bright) * 1.6);
    far.tailLen = o.tailLen * (1 + (1 - bright) * 1.2);
    /* A distant gun must never be rate-limited out by a near one: the
       guard is per-report and the far ones are the quiet ones. */
    far.minGap = 0.010;
    /* The two falloffs, returned alongside so the claim about them is
       testable directly. `report` never sees this element.

       It matters because the obvious test -- "does the crack fall
       faster than the volume?" -- is satisfied by the SQUARING of
       `bright` alone, so it passes even when `bright` is set equal to
       `att` and the model has stopped distinguishing distance from
       volume at all. I know because I tried exactly that regression
       and the test stayed green. The claim worth asserting is the
       physical one: high frequencies are absorbed by air faster than
       amplitude is, so bright < att at every distance. */
    return [v[0], far, { att: att, bright: bright }];
  }

  function makeWorldAudio(game) {
    var last = [];                      // per-combatant: ammo, stepped-from
    var lastDamage = 0, lastKills = 0;
    return function tick(M) {
      if (!game.audio || !M || !M.people) return;
      var me = M.you, A = game.audio;
      var ex = me ? me.pos.x : 0, ey = me ? me.pos.y : 0, ez = me ? me.pos.z : 0;
      for (var i = 0; i < M.people.length; i++) {
        var p = M.people[i];
        var st = last[i] || (last[i] = { ammo: -1, sx: p.pos.x, sz: p.pos.z, walk: 0 });
        var held = p.ammo ? p.ammo[p.held] : -1;
        var dx = p.pos.x - ex, dy = p.pos.y - ey, dz = p.pos.z - ez;
        var d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        /* SOMEBODY ELSE FIRED. The local player's own shot is played by
           fireSound with the full close voice, so it is skipped here or
           every shot you take is two shots. */
        if (st.ammo >= 0 && held >= 0 && held < st.ammo && (!me || p.id !== me.id)) {
          var v = distant(p.guns ? p.guns[p.held] : null, d);
          if (v) { try { A.report(v[0], v[1]); } catch (e) { /* never drop a frame for audio */ } }
        }
        st.ammo = held;
        /* FOOTSTEPS, by distance travelled rather than by a timer, so
           they keep pace with however fast the man is actually moving
           and stop dead when he does. */
        if (p.alive) {
          var mx = p.pos.x - st.sx, mz = p.pos.z - st.sz;
          st.walk += Math.sqrt(mx * mx + mz * mz);
          st.sx = p.pos.x; st.sz = p.pos.z;
          if (st.walk > 0.95) {
            st.walk = 0;
            var fa = 1 / (1 + (d / 5.0) * (d / 5.0));
            if (fa > 0.05) {
              try { A.impact(0.10, { volume: fa * 0.5 }); } catch (e) { /* ditto */ }
            }
          }
        } else { st.walk = 0; st.sx = p.pos.x; st.sz = p.pos.z; }
      }
      /* THE HIT MARKER, which is information and not decoration: it is
         the only way to know a shot connected on a man you cannot see
         go down. A short bright tick, close and dry. */
      if (me) {
        if (me.damage > lastDamage + 0.5) {
          var head = me.kills > lastKills;
          try { A.tone(head ? 1650 : 1180, 0.045, 'square', 0.055); } catch (e) { void e; }
        }
        lastDamage = me.damage || 0;
        lastKills = me.kills || 0;
      }
    };
  }

  function buildGun(game, id) {
    var made = null;
    var fn = VM_BESPOKE[id];
    if (fn && typeof game[fn] === 'function') {
      try { made = game[fn]({ at: [0, -90, 0], physics: false }); } catch (e) { made = null; }
    }
    if (!made) {
      try { made = game.serviceArm(id, { at: [0, -90, 0], physics: false }); } catch (e) { made = null; }
    }
    if (!made && VM_FALLBACK[id]) {
      try { made = game.serviceArm(VM_FALLBACK[id], { at: [0, -90, 0], physics: false }); } catch (e) { made = null; }
    }
    if (!made) {
      try { made = game.serviceArm('m4', { at: [0, -90, 0], physics: false }); } catch (e) { made = null; }
    }
    /* AND THE HANDS. The engine has had a fully solved pair of them all
       along -- fingers that close onto the weapon's own surface until
       they touch it -- and multiplayer never called it once. A floating
       gun with no hands is the oldest tell there is that a game is a
       prototype, and it has been on the screen this whole time. */
    /* THE ATTACHMENTS YOU FITTED. Multiplayer mounted none, ever --
       not because the parts are missing, there are sixty-nine of them
       and every one is a real model, but because nothing in this file
       ever called for one. Placement comes off the weapon's own
       measurements per slot, so the same optic sits correctly on a
       pistol and on a light machine gun. */
    if (made && game.fitAttachments) {
      try {
        var D = W.MP_DATA;
        var sp2 = D && D.gun ? D.gun(id) : null;
        var list = (D && D.ATTACHMENTS ? D.ATTACHMENTS : [])
          .filter(function (a) { return !sp2 || !a.classes || a.classes.indexOf(sp2.cls) >= 0; })
          .map(function (a) { return { id: a.id, slot: a.slot }; });
        game.fitAttachments(made, {
          parts: list,
          bore: sp2 && sp2.bore ? sp2.bore : 0.0046,
          feed: sp2 && sp2.feed ? sp2.feed : 'box',
        });
      } catch (e) { /* a weapon with no parts is still a weapon */ }
    }
    if (made && game.viewmodelArms) {
      try {
        var spec = W.MP_DATA && W.MP_DATA.gun ? W.MP_DATA.gun(id) : null;
        made.__arms = game.viewmodelArms(made, handsFor(made, spec && (spec.cls || spec.class)), {
          key: 'mp:' + id,
          boreY: made.boreAt != null ? made.boreAt : null,
          sightY: made.sightAt != null ? made.sightAt : null,
          surface: game.weaponSurface ? game.weaponSurface(made) : null,
        });
      } catch (e) { made.__arms = null; }
    }
    return made;
  }

  /* WHICH OF THE SIX (now seven) A WEAPON RELOADS WITH.
   *
     mp-data says 'mag', 'shell', 'moon' or 'clip', which is a stat-sheet
     vocabulary rather than an animation one -- 'shell' covers both a
     break gun that takes two at once and a pump gun that takes five one
     at a time, and those are not the same movement at all. The ACTION
     already knows the difference, because it is the thing that decides
     whether the gun hinges open or has a lifter, so ask it first and
     fall back to the stat sheet.

     'tube' is new. Thirteen pump and lever shotguns were going to reload
     like a broken double, which is a gun hinging open that does not
     hinge. */
  function reloadKindFor(spec, act) {
    var a = act && act.kind;
    if (a === 'break') return 'break';
    if (a === 'revolver' || a === 'rotary') return 'revolver';
    if (a === 'belt') return 'belt';
    if (a === 'energy') return 'cell';
    /* A LAUNCHER DOES NOT TAKE A MAGAZINE. With no path of its own the
       Panzerfaust, the Bazooka, the RPG and the Stinger all fell through
       to `mag` -- and a tube has no magazine well, so magWell came back
       as the weapon's own origin and a pistol magazine was posted into
       the middle of the barrel. A rocket instead: a warhead on a motor
       tube, brought up from below and in front and pushed home. The two
       that are NOT this -- the M79 hinges and the six-shot revolves --
       are caught above, by their own declared action. */
    if (spec && spec.cls === 'launcher') return 'rocket';
    var k = spec && spec.reloadKind;
    if (k === 'clip') return 'clip';
    if (k === 'moon') return 'revolver';
    /* A shell-fed gun that does not hinge is loaded a round at a time
       through the gate -- pump, lever and the two semi-auto shotguns. */
    if (k === 'shell') return 'tube';
    return 'mag';
  }

  function makeViewmodel(game) {
    var cache = {};
    var cur = null, curId = null;
    var Q = new W.LE.Quat(), Q2 = new W.LE.Quat();
    /* VEC3, NOT ARRAYS. setAxisAngle reads axis.x / axis.y / axis.z, and
       an array has none of them -- so `[0,1,0].x * sin(h)` is undefined
       times a number, which is NaN, and the quaternion came out
       NaN,NaN,NaN,NaN every single frame.
     *
       A composed matrix writes its translation column straight from the
       position, so the actor's world POSITION stayed perfectly correct
       and every check I wrote -- is it visible, is it in front of the
       camera, is it on the right of the screen, does it reach a draw
       call -- passed. Only the rotation part of the matrix was NaN,
       which is enough for the GPU to throw away every triangle of the
       weapon AND of the muzzle flash that copies the same quaternion.

       The multiplayer viewmodel has therefore never once been drawn.
       "I can't see my gun, it's invisible", "there's no muzzle flash",
       "the gun models are 0% developed" -- one line, and I read past it
       for a week because the numbers either side of it were right. */
    var AX = new W.LE.Vec3(1, 0, 0), AY = new W.LE.Vec3(0, 1, 0),
        AZ = new W.LE.Vec3(0, 0, 1);
    /* The muzzle flash: a short bright cone that lives at the end of
       the bore and is off almost all the time. There was none at all --
       "no muzzle flash, nothing" -- and a gun that fires without one
       does not read as firing, whatever the sound does. */
    var flash = null, flashT = 0;
    try {
      flash = game.cone
        ? game.cone({ at: [0, -90, 0], radius: 0.085, height: 0.24, physics: false,
          material: { color: 0xffd9a0, emissive: 0xffb347, emissiveIntensity: 4.0,
            texture: 'smooth', roughness: 1 } })
        : game.box({ at: [0, -90, 0], size: [0.11, 0.11, 0.26], physics: false,
          material: { color: 0xffd9a0, emissive: 0xffb347, emissiveIntensity: 4.0,
            texture: 'smooth', roughness: 1 } });
      if (flash) { flash.noCull = true; flash.visible = false; }
    } catch (e) { flash = null; }

    var state = { aim: 0, sprint: 0, ox: 0, oy: 0, oz: 0, placed: 0, hidden: 0,
      gun: null, reload: 0,
      /* THE MECHANISM. Everything below this line was missing: this
         viewmodel builds a real serviceArm -- the same one bunker-nine
         builds, with the same bolt, cylinder, hammer, cover and belt
         hanging off it -- and drove none of it. Seventy-five guns fired
         with a dead receiver: a flash at the muzzle and nothing moving
         behind it. Counted before it was fixed: `bolt`, `cylinder`,
         `hammer`, `cover`, `belt`, `forend` and `swing` each appeared
         ZERO times in this file. */
      cyc: 0, cycMax: 0.085,   // the automatic stroke, per shot
      hand: 0, handMax: 0.9,   // a hand-worked stroke, between shots
      trig: 0, rounds: 0, spin: 0, act: null, actId: null,
      /* THE LOAD IN THE SUPPORT HAND. Multiplayer's reload was a
         positional dip and an ammunition counter: the gun tipped, the
         number went back up, and no magazine ever left a pouch or
         entered a well on any of seventy-five weapons. Zombies has had
         the whole thing for months -- a real magazine, clip, cell,
         belt, pair of shells or handful of loose rounds, carried by a
         hand that goes and fetches it -- and it was three hundred lines
         inside bunker-nine.js where nothing here could reach it. It is
         engine/src/97f-reload.js now and both games drive it. */
      rlKind: null, rlId: null, rlProp: null, rlStage: 0,
      /* Last frame's reload and inspect fractions, so a cue can be
         played exactly once whatever the frame rate: a mark that falls
         between `was` and `now` fires, and nothing else does. A
         per-stage flag cannot do this -- it needs one flag per sound
         and it fires twice if the clock ever goes backwards. */
      rlWas: 0, insWas: 0,
      // The idle drift's own clock -- see place().
      swayT: 0 };
    /* One prop per weapon, built the first time it is needed and kept.
       A magazine is a few hundred triangles and a mesh upload, and
       doing that on the frame a man with an empty gun reaches for one
       is a hitch at the worst possible moment. */
    var props = {};
    /* The litter. Capped at twenty, because a match is long and an LMG
       fires five hundred rounds -- the cap is the caller's, which is
       why the engine takes the list rather than owning one. */
    var brass = [];

    function show(g, on) {
      if (!g) return;
      g.visible = on;
      if (!on && window.LE.stowReloadProp) window.LE.stowReloadProp(state.rlProp);
      // The hands go with it, or a pair of them floats where the last
      // weapon was.
      if (g.__arms && g.__arms.parts) {
        for (var h = 0; h < g.__arms.parts.length; h++) g.__arms.parts[h].visible = on;
      }
      if (g.partNames) {
        for (var i = 0; i < g.partNames.length; i++) {
          var a = g[g.partNames[i]];
          if (a && a !== g) { a.visible = on; a.noCull = true; }
        }
      }
      g.noCull = true;
    }

    /* SHOWN, not merely selected.
     *
       This returned early when the id had not changed -- and hide()
       turns the model off without changing the id. So the first time
       anything hid the gun (dying, which happens every life) place()
       took the early exit for the rest of the match and never turned
       it back on. The only way to get your weapon back was to switch
       to the other one.

       "My gun doesn't even come up any more, I can't bring it up, it's
       invisible" is this early return. */
    var shown = false;
    var fitted = [];

    /* WHICH MAGAZINE IS ON THE GUN, in the vocabulary the reload path
       speaks. A drum is heavy and wide and is rocked in back-first; an
       extended magazine is long enough that it has to come up steeper
       or its nose catches the well; a fast magazine has a loop on it
       and is snapped in from a shorter reach. Three different objects
       in the hand, three different movements, and the same three names
       zombies uses so one table serves both games. */
    function fittedMag() {
      for (var i = 0; i < fitted.length; i++) {
        if (fitted[i] === 'g-drum') return 'drummag';
        if (fitted[i] === 'g-ext') return 'extmag';
        if (fitted[i] === 'g-fast') return 'fastmag';
      }
      return null;
    }

    /* Every part is built and hidden; this is what decides which of
       them you can see. One per slot, because two optics on one rail
       is two optics on one rail. */
    function applyAtts() {
      if (!cur || !game.showAttachments) return;
      var D = W.MP_DATA;
      game.showAttachments(cur, fitted.map(function (a) {
        var m = D && D.att ? D.att(a) : null;
        return { id: a, slot: m ? m.slot : null };
      }));
    }

    function select(id) {
      if (id === curId) {
        if (cur && !shown) { show(cur, true); shown = true; }
        return cur;
      }
      if (cur) show(cur, false);
      if (!cache[id]) cache[id] = buildGun(game, id);
      cur = cache[id]; curId = id;
      state.gun = id;
      if (cur) show(cur, true);
      shown = true;
      applyAtts();
      return cur;
    }

    return {
      state: state,
      get gun() { return cur; },
      select: select,
      /* What the loadout says is bolted to this weapon. */
      fit: function (ids) { fitted = ids || []; applyAtts(); },
      get fitted() { return fitted.slice(); },
      /* BUILD THE GUNS BEFORE THE MATCH STARTS.
         A weapon is a few thousand vertices of receiver, rifling,
         checkering and individual brass rounds, assembled in
         JavaScript on the frame it is first needed. That is a hitch of
         several frames the first time you press Q, and another the
         first time you pick one up -- a long frame in the middle of a
         gunfight, which is exactly what "glitchy" describes and is
         invisible in any average frame rate. Both loadout guns are
         built during the loading screen instead, where a hitch costs
         nothing. */
      warm: function (ids) {
        for (var i = 0; i < ids.length; i++) {
          var id = ids[i];
          if (!id || cache[id]) continue;
          cache[id] = buildGun(game, id);
          show(cache[id], false);
          if (id === curId) shown = false;
        }
      },
      /* One shot: the flash comes on for forty milliseconds, which is
         about two frames and is all a real one lasts. */
      fired: function (refire) {
        flashT = 0.04;
        state.rounds++;
        /* The breech runs in about a tenth of a second whatever the
           rate of fire, but it cannot take longer than the gap between
           shots or a fast gun would be caught mid-stroke every time. */
        state.cycMax = Math.max(0.045, Math.min(0.095, (refire || 0.1) * 0.62));
        state.cyc = state.cycMax;
        /* And a hand-worked gun starts its stroke AFTER the shot, not
           during it -- that pause is the whole feel of a bolt gun. */
        if (state.act && state.act.cycle === 'hand') {
          state.handMax = Math.max(0.35, (refire || 1.0) * 0.78);
          state.hand = state.handMax;
        }
        /* AND THE BRASS. Seventy-five weapons fired without a single
           case in the air: zombies has thrown one out of the port on
           every shot for months and nothing in this file had ever
           asked for one. game.ejectCase is the same arithmetic both
           games now run -- the port and the direction through the
           weapon's own matrix, so the case leaves the way the gun is
           actually pointing.

           A HAND-WORKED GUN DOES NOT SPIT ON THE SHOT. A bolt rifle
           holds its case in the chamber until the bolt is lifted and
           drawn, so its brass comes out on the stroke -- see below --
           and a revolver does not eject at all until the rod is
           pushed. Asking here for all three would put brass in the air
           at the wrong moment on nineteen weapons. */
        var ac = state.act;
        if (cur && (!ac || ac.eject === 'shot' || ac.eject == null)) {
          try { game.ejectCase(cur, { keep: brass, cap: 20 }); } catch (e) { void e; }
        }
      },
      hide: function () {
        state.hidden++;
        if (cur) show(cur, false);
        shown = false;
        if (flash) flash.visible = false;
        /* And whatever the hand was carrying. A magazine left visible
           when the weapon goes away hangs in the air where the gun
           used to be -- the same fault zombies had and fixed. */
        if (window.LE.stowReloadProp) window.LE.stowReloadProp(state.rlProp);
      },
      /* `reload` is how far through the reload we are, 0..1 and LINEAR,
         with 0 meaning not reloading. It used to be the sine bump that
         drops the gun, which is a shape and not a clock -- it comes
         back to zero at the end and passes through every value twice,
         so nothing downstream could tell the fetch from the seat. The
         bump is derived from it here instead. */
      place: function (eye, yaw, pitch, aim, sprint, kick, bob, id, reload, dt, ammoFrac, swapU, insU, insW) {
        var g = select(id || curId || 'm4');
        state.placed++;
        /* The column of rounds inside the magazine. Defaults to full
           when a caller does not say, so nothing that has not been
           taught about ammunition suddenly renders an empty gun. */
        if (g && g.setRounds) g.setRounds(ammoFrac == null ? 1 : ammoFrac);
        state.aim = aim;
        var low = sprint ? 1 : 0;
        state.sprint = low;
        var rlU = Math.max(0, Math.min(1, reload || 0));
        state.reload = rlU > 0 ? Math.sin(rlU * Math.PI) : 0;
        /* Both cue clocks reset the moment a reload ends, HERE rather
           than inside the arms block further down: a weapon with no
           hands built would leave `rlWas` at wherever the last one
           finished, and the next reload would then play no cue at all
           until it had passed that mark. */
        if (rlU <= 0) { state.rlWas = 0; state.rlStage = 0; }
        /* THE INSPECT. A curve rather than a clip -- a viewmodel is one
           actor held at an offset from the eye, so the thing that moves
           is the offset. The shape is engine/src/97g-inspect.js and
           zombies runs the same one. */
        var insU2 = Math.max(0, Math.min(1, insU || 0));
        if (window.LE.INSPECT_SOUNDS) {
          game.cueSounds(window.LE.INSPECT_SOUNDS, state.insWas, insU2);
        }
        state.insWas = insU2;
        var INS = (insU2 > 0 && window.LE.inspectPose)
          ? window.LE.inspectPose(insU2, insW == null ? 1 : insW)
          : { in: 0, up: 0, side: 0, yaw: 0, pitch: 0, roll: 0, bolt: 0, tap: 0 };
        state.ins = insU2;

        /* Run the mechanism. The action comes from the weapon's own
           declaration where it has one and from its family otherwise;
           poseAction skips any part the model does not carry, so this
           is safe on all eighty-one of them.
         *
           `LE` AND NOT `W`, AND THAT IS THE WHOLE OF A BUG.
         *
           This said `var W = window.LE` and then asked `W.MP_DATA` for
           the weapon's spec. MP_DATA is on `window`, not on the engine,
           so the lookup was undefined every time -- on every weapon,
           every frame, since the mechanism was written. weaponAction was
           handed nothing and returned its default, which is
           selfLoading, so the whole rack ran a self-loader's action: the
           sawn-off's barrels never hinged, the Webley's cylinder never
           swung, the pump guns' forends never racked, and eleven weapons
           that declare their own action had it read off a null.

           The file has a module-level `var W = window` thirteen hundred
           lines up and this shadowed it inside one function, so both
           lines look correct on their own. Caught by the new
           mpreload.test.js, which printed `{"mag": 75}` for a rack with
           thirteen shotguns and three revolvers in it. */
        var LE = window.LE;
        if (LE && LE.weaponAction && g) {
          if (state.actId !== id) {
            state.actId = id;
            var sp = (window.MP_DATA && window.MP_DATA.gun) ? window.MP_DATA.gun(id) : null;
            state.act = LE.weaponAction(sp);
          }
          var d = dt || 0;
          state.cyc = Math.max(0, state.cyc - d);
          var handWas = state.hand;
          state.hand = Math.max(0, state.hand - d);
          /* A HAND-WORKED ACTION EJECTS ON THE STROKE, not on the shot.
             A bolt rifle holds its case in the chamber until the bolt is
             lifted and drawn, so the brass leaves near the top of the
             stroke -- and that pause between the bang and the tinkle is
             most of what a bolt gun feels like. The same is true of a
             pump and a lever. */
          if (state.act && state.act.eject === 'cycle' && handWas > 0 && state.handMax > 0) {
            var hu0 = 1 - handWas / state.handMax, hu1 = 1 - state.hand / state.handMax;
            if (hu0 < 0.45 && hu1 >= 0.45) {
              try { game.ejectCase(g, { keep: brass, cap: 20 }); } catch (e) { void e; }
            }
          }
          /* Trigger: in fast, out slower, off the same clock as the
             shot -- and a revolver's cylinder indexes on it, so it has
             to be a real curve and not a flag. */
          var tw = state.cyc > 0 ? 1 : 0;
          state.trig += (tw - state.trig) * Math.min(1, d * (tw ? 34 : 12));
          state.spin += d * (state.cyc > 0 ? 6 : 0);
          LE.poseAction(g, state.act, {
            /* Back hard and forward on the return: a half sine, which
               is the shape the real thing traces. */
            fire: state.cyc > 0 ? Math.sin((1 - state.cyc / state.cycMax) * Math.PI) : 0,
            /* The hand-worked stroke, and the inspect uses the same
               channel: opening the action to look at the chamber is
               the same movement as working it, so a bolt gun's bolt,
               a pump's forend, a revolver's cylinder and a break
               gun's barrels all do the right thing for free. */
            hand: Math.max(
              state.hand > 0 ? Math.sin((1 - state.hand / state.handMax) * Math.PI) : 0,
              INS.bolt),
            reload: state.reload, trigger: state.trig,
            rounds: state.rounds, spin: state.spin,
          });
        }

        /* The camera frame. f forward, r right, u up -- the same basis
           the match uses for everything else, so the gun and the shot
           cannot disagree about which way is forward. */
        var cy = Math.cos(yaw), sy = Math.sin(yaw);
        var cp = Math.cos(pitch), sp = Math.sin(pitch);
        var fx = sy * cp, fy = -sp, fz = cy * cp;
        /* The player's right is -X at yaw 0, not +X. With the sign
           the wrong way round the gun was held out over the LEFT
           shoulder and far enough off axis to be out of frame -- which
           reads exactly like "my gun doesn't come up, it's invisible". */
        var rx = -cy, rz = sy;
        var ux = sy * sp, uy = cp, uz = cy * sp;

        /* Where it sits. Right of the eye and below it at the hip,
           swinging onto the centre line and up to the sight as you aim.
           The reload drops it further and the sprint drops it further
           still. */
        /* A RELOAD BRINGS THE WEAPON UP, NOT DOWN.
         *
           This dropped it 75 mm, on top of a hip carry that already sits
           128 mm below the eye -- so the gun was loaded somewhere around
           the knees and the player watched an empty room. It is the
           exact fault zombies found and fixed before multiplayer had a
           reload animation at all, and writing one here reintroduced it
           from scratch: the note next door says "you cannot see the
           shells go in if you cannot see the gun".

           Measured rather than argued about. mpreload.test.js projects
           the load through the live camera on all seventy-five weapons
           and counts the frames it spends below the bottom edge: with
           the dip, six of them -- the two bullpups, the MP5, the micro
           Uzi, the Remington and the Kill Streak, every one of them a
           weapon whose magazine well sits low and far back -- lost
           between a third and a half of the carry off frame. The lift
           is zombies' measured 98 mm, with its 52 mm draw-in, and the
           roll and the levelling that were already here. */
        var rl = state.reload;

        /* WHERE THE WEAPON IS HELD, and this was invented here instead
           of taken from the game next door that already had it right.
         *
           A screenshot of multiplayer is a featureless black mass
           hanging in the middle of the frame. That is not a broken
           model: it is a CORRECT model with the camera inside it. The
           weapon's origin sits about 42cm behind its own muzzle (see
           body.muzzleAt), this held that origin 0.30m from the eye, and
           so the receiver and the whole stock were BEHIND the camera
           and what filled the screen was the inside of the gun.

           Zombies solved this properly and the numbers are measured:
           hip 0.355m out plus a bulk term, 0.150 down, 0.092 right --
           and then the whole thing pushed out by 1.30, laterals and
           all, because at 30cm a correct model subtends half the
           screen and real engines dodge it with a separate narrow
           field of view for the viewmodel. Holding it further away is
           the same trick with one camera: same framing, smaller, and
           no longer pressed against the eye.

           Taken from updateViewmodel() in bunker-nine rather than
           re-derived, because re-deriving it is what produced the
           black mass. */
        var len = (g && g.muzzleAt != null) ? g.muzzleAt : 0.42;
        var bulk = Math.max(0, Math.min(1, (len - 0.24) / 0.34));
        /* MEASURED OFF THIS WEAPON, not one constant for all sixty.
           sightAt is the height of the sight line above the model's own
           origin and every serviceArm build sets it. Using 0.0455 for
           everything is why the irons sit high on most of the rack: put
           the sight line anywhere but on the camera axis and you are
           looking at the gun rather than through it. */
        var sightH = (g && g.sightAt != null) ? g.sightAt
          : ((g && g.sightH != null) ? g.sightH : 0.0455);
        /* THE SWAP, ON SCREEN.
         *
           The gun travels one and three quarter times the low-ready
           drop, which is far enough to clear the bottom of the frame on
           everything from a 1911 to an MG42 -- and clearing the frame is
           the entire requirement, because the slot changes while it is
           down there and the exchange must not be visible.

           Down is fast and up is slower, which is how it works with a
           real weapon and is also what makes the two halves read as two
           motions rather than as one thing bouncing. The muzzle dips as
           it goes and comes back level on the way up, so it pivots out
           of the shoulder rather than sliding down a rail.

           The drop is proportional to length for the reason the sprint
           carry is: a 1911 sits 84 per cent of the way down the frame
           and an MG42's receiver at 68, so the same number of
           centimetres takes one off the bottom edge and leaves the
           other in plain sight. */
        var swapU2 = Math.max(0, Math.min(1, swapU || 0));
        var swapDrop = 0, swapTip = 0, swapRoll = 0;
        if (swapU2 > 0 && swapU2 < 1) {
          var su = swapU2 < 0.5
            ? Math.pow(swapU2 / 0.5, 0.72)              // 0 -> 1, fast
            : Math.pow(1 - (swapU2 - 0.5) / 0.5, 1.45); // 1 -> 0, slower
          swapDrop = su * (0.085 + bulk * 0.062) * 1.75;
          swapTip = su * 0.52;
          swapRoll = su * 0.30;
        }
        var OUT = 1.30;
        /* No invented drop term here. Zombies subtracts a `tipDrop`
           that belongs to ITS rotation scheme, and adding my own guess
           at one put the whole weapon eight centimetres below the
           bottom of the frame -- a gun you cannot see, which is where
           this started. The measured hip height is the measured hip
           height. */
        /* A little higher than zombies carries it, because zombies is
           not also drawing a pair of hands wrapped round the forend --
           the hands hang below the weapon and took the bottom third of
           the assembly off the bottom of the frame. */
        var hipX = 0.092 + bulk * 0.020;
        var hipY = -0.128 - bulk * 0.026;
        var hipD = 0.355 + bulk * 0.055;
        /* The aimed vertical is NOT scaled by OUT. It is -sightH
           exactly, because that is what puts the front blade and the
           rear notch on the camera axis, and it is -sightH at any
           distance. */
        /* IDLE SWAY. A held weapon is never perfectly still, and
           multiplayer's was: the walk bob decays to exactly zero the
           moment you stop, and from then on the gun is welded to the
           screen. That is the single clearest tell that a viewmodel is
           a picture rather than an object, and zombies has had the
           drift since it had a viewmodel.

           Slow -- about a quarter of a hertz on the vertical and half
           that on the lateral, so the two never come back into phase
           and it does not read as a loop -- and a millimetre and a
           half at most. Killed by aiming, because a sight picture that
           wanders is a sight picture you cannot use, and killed by
           moving, because the bob is already doing this job. */
        /* The sway is on the view's clock rather than the match's --
           place() is not given match time -- but it is clamped the same
           way, so a long frame is a long frame and not a lurch. */
        state.swayT += Math.min(dt || 0, 0.05) * 1.6;
        var still = Math.max(0, 1 - Math.abs(bob) * 90);
        var swayK = (1 - aim * 0.88) * still;
        var swayY = Math.sin(state.swayT * 2) * 0.0016 * swayK;
        var swayX = Math.cos(state.swayT) * 0.0010 * swayK;

        var offR = hipX * OUT * (1 - aim) + INS.side + swayX;
        var offU = hipY * OUT * (1 - aim) + (-sightH) * aim
          - low * 0.085 + rl * 0.098 + bob * 0.6 - swapDrop + INS.up + swayY;
        var dist = (hipD * (1 - aim) + 0.30 * aim) * OUT - kick * 0.03 - low * 0.03
          - INS.in
          /* And drawn in toward the face while the hands work, which is
             the other half of "you can see what is being done to it". */
          - rl * 0.052;

        if (flash) {
          flashT = Math.max(0, flashT - (dt || 0.016));
          flash.visible = flashT > 0;
        }
        if (!g) return;

        g.position.set(
          eye.x + rx * offR + ux * offU + fx * dist,
          eye.y + uy * offU + fy * dist,
          eye.z + rz * offR + uz * offU + fz * dist
        );

        /* THE ORIENTATION, and the hip cant is the whole of it.
         *
           A gun held to the right of the eye and in front of it
           converges on the vanishing point in the middle of the screen,
           so a bore that is level in the WORLD reads as pointing up on
           SCREEN -- which is the only place anybody looks at it. The
           muzzle has to fall as fast as perspective lifts it. Zombies
           measured that at about 29 degrees for this hold and the
           number is reused rather than guessed at again.

           Blended out entirely with the aim, because aiming is geometry:
           at full ADS the bore must be exactly on the camera axis or the
           sights do not line up with the crosshair. */
        var fh = Math.hypot(fx, fz) || 1e-6;
        var gy = Math.atan2(-fz / fh, fx / fh) + INS.yaw;
        /* The hip cant, and it was 0.50 -- twenty-nine degrees of muzzle
           down, which points the whole barrel out of the bottom of the
           picture on a long weapon. Enough to read as a hip carry, not
           enough to throw the gun off screen. */
        /* The swap's tip is not blended out with the aim the way the hip
           cant is: you cannot be looking through the sights of a weapon
           that is on its way out of your hands. */
        var tip = (1 - aim) * (0.30 + low * 0.14) * (1 - rl * 0.85) + swapTip - INS.pitch;
        var gp = Math.asin(Math.max(-1, Math.min(1, fy))) - tip;
        var roll = low * 0.42 + (1 - aim) * 0.03 + rl * 0.30 + swapRoll + INS.roll;
        Q.setAxisAngle(AY, gy);
        Q2.setAxisAngle(AZ, gp);
        Q.mulQuats(Q, Q2);
        if (roll > 1e-4) { Q2.setAxisAngle(AX, roll); Q.mulQuats(Q, Q2); }
        g.rotation.copy(Q);
        g._still = false;

        state.ox = offR; state.oy = offU; state.oz = dist;

        /* The flash goes on the end of the BORE, which is a property of
           the model -- not a guess at where the front of the gun is. */
        if (flash && flash.visible) {
          var mz = (g.muzzleAt != null ? g.muzzleAt : 0.42) + 0.10;
          flash.position.set(
            g.position.x + fx * mz, g.position.y + fy * mz, g.position.z + fz * mz
          );
          flash.rotation.copy(Q);
          flash._still = false;
        }

        /* ============ THE LOAD, AND THE HAND THAT CARRIES IT ============
         *
           Everything above this line is the gun. This is the other half
           of a reload: the support hand leaves the forend, drops to the
           pouch, and comes back with a real object that goes into a real
           opening. It is the same code zombies runs -- reloadReach for
           the hand, poseReload for the load -- because it is in the
           engine now rather than in one game's file.

           Last in place(), so the on-screen check reads the weapon's
           matrix for this frame's hold rather than the previous one's. */
        var arms = g.__arms;
        if (LE && LE.reloadReach && arms && arms.support && arms.support.length) {
          if (state.rlId !== id) {
            state.rlId = id;
            var rsp = (window.MP_DATA && window.MP_DATA.gun) ? window.MP_DATA.gun(id) : null;
            state.rlKind = reloadKindFor(rsp, state.act);
            state.rlMag = (rsp && rsp.mag) || 8;
          }
          var kind = state.rlKind;
          /* AND WHAT IT SOUNDS LIKE. Multiplayer reloaded seventy-five
             weapons in silence: the magazine catch, the magazine
             leaving, the fresh one going in and the slide running
             forward all happened without a noise between them. The
             cue list is per kind and lives in the engine beside the
             movement it belongs to, so a break gun hears its hinge and
             a tube gun hears five shells go up the gate. */
          if (LE.RELOAD_SOUNDS) {
            game.cueSounds(LE.RELOAD_SOUNDS[kind], state.rlWas, rlU);
          }
          state.rlWas = rlU;

          /* WHAT THE RELOAD THROWS AWAY, once per reload rather than
             once per frame. `rlStage` counts the beats that have gone
             by; it is reset the moment a reload ends. */
          if (rlU > 0) {
            var ej = state.act && state.act.eject;
            /* The old magazine, out of the well and onto the floor.
               Multiplayer reloaded seventy-five weapons and not one of
               them ever dropped anything. */
            if (state.rlStage < 1 && rlU > 0.16 && kind === 'mag') {
              state.rlStage = 1;
              try {
                game.dropMagazine(g, { fitted: fittedMag(), keep: brass, cap: 20 });
              } catch (e) { void e; }
            }
            /* A REVOLVER'S SIX COME OUT TOGETHER, on the ejector rod,
               when the cylinder is out -- it does not eject while
               firing, which is the whole point of the design. A break
               gun's pair are thrown clear as it opens. */
            if (state.rlStage < 2 && rlU > 0.20 && (ej === 'reload' || ej === 'open')) {
              state.rlStage = 2;
              var n = ej === 'open' ? 2 : Math.min(6, state.rlMag || 6);
              for (var e2 = 0; e2 < n; e2++) {
                try {
                  game.ejectCase(g, { drop: ej === 'reload', keep: brass, cap: 20 });
                } catch (e) { void e; }
              }
            }
          }
          var ox2 = 0, oy2 = 0, oz2 = 0, carry = -1;
          if (rlU > 0 && LE.RELOAD_CARRIES[kind]) {
            var RE = LE.reloadReach(rlU, kind);
            ox2 = RE.x; oy2 = RE.y; oz2 = RE.z; carry = RE.t;
          }
          /* The tap on the base of the magazine, which is the fourth
             beat of the inspect. A short push, not a hold. Added AFTER
             the reach, not before: a reload assigns these three rather
             than adding to them, and the two can never overlap by more
             than a frame anyway -- a reload cancels an inspect -- but a
             term that is silently thrown away is how the swap's tip came
             to be dead for months. */
          if (INS.tap > 0) { oy2 += INS.tap * 0.018; ox2 -= INS.tap * 0.010; }
          var handSet = false;
          if (carry >= 0) {
            var prop = game.reloadProp(props, id, g, kind, {
              /* No ammunition table in multiplayer, so the engine's own
                 defaults do the work. The magazine builder takes its
                 dimensions from the gun it is parented to in every case
                 that matters, and a 9 mm case in a rifle magazine is
                 not a thing anybody has ever been able to see at
                 viewmodel distance. */
              ammo: {},
              mag: state.rlMag,
            });
            state.rlProp = prop;
            if (prop) {
              var at = game.poseReload({
                prop: prop, kind: kind, t: carry, root: g, camera: game.camera,
                bore: g.boreAt != null ? g.boreAt : 0.06,
                magWell: g.magWell || [0.02, -0.055, 0],
                breechAt: g.breechAt,
                sightAt: g.sightAt,
                muzzleAt: g.muzzleAt,
                mag: state.rlMag,
                /* The fitted magazine changes how it is brought in -- a
                   drum is rocked in back-first, an extended one comes up
                   steeper. Read off what is actually on the gun. */
                fitted: fittedMag(),
              });
              if (at) {
                /* The hand is placed FROM the load, offset by where the
                   fingers close on it, so the two cannot drift apart.
                   Two separate paths that merely run near each other is
                   what makes a magazine travel BESIDE a hand rather
                   than in it. */
                var dl = arms.digits && arms.digits.left;
                var home = (dl && dl.at) || [0, 0, 0];
                for (var s2 = 0; s2 < arms.support.length; s2++) {
                  arms.support[s2].setPosition([
                    at.x + at.hold[0] - home[0],
                    at.y + at.hold[1] - home[1],
                    at.z + at.hold[2] - home[2]]);
                }
                handSet = true;
              }
            }
          } else if (state.rlProp) {
            LE.stowReloadProp(state.rlProp);
          }
          if (!handSet) {
            for (var s3 = 0; s3 < arms.support.length; s3++) {
              arms.support[s3].setPosition([ox2, oy2, oz2]);
            }
          }
        }
      },
    };
  }

  /* ================================================================
     THE HUD
     ================================================================ */

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function clock(sec) {
    sec = Math.max(0, Math.round(sec));
    var m = Math.floor(sec / 60), s = sec % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function makeHud(root, M) {
    var q = function (sel) { return root.querySelector(sel); };
    var el = {
      cross: q('.cross'), hit: q('.hit'), dmg: q('.dmg'),
      sc: q('.top .sc'), us: q('.top .us'), them: q('.top .them'),
      clock: q('.clock'), mode: q('.mode'), bomb: q('.bomb'),
      feed: q('.feed'), hp: q('.hp'), hpn: q('.hp .n'), hpbar: q('.hp .bar i'),
      who: q('.hp .who'),
      gname: q('.gun .nm'), mag: q('.gun .m'), res: q('.gun .r'), re: q('.gun .re'),
      dead: q('.dead'), deadBy: q('.dead .by'), deadN: q('.dead .n'),
      board: q('.board'), over: q('.over'),
      xUp: q('.cross .up'), xDn: q('.cross .dn'),
      xLf: q('.cross .lf'), xRt: q('.cross .rt'),
    };
    /* WRITE ONLY WHAT CHANGED.
       Every line in paint() ran sixty times a second against the DOM,
       and setting textContent to the value it already holds still
       dirties the node and still costs a style recalculation. Ten
       nodes, four crosshair arms and a width in per cent, every frame,
       over a full-screen overlay -- for a clock that changes once a
       second and a magazine that changes when you fire. The game is
       accused of feeling glitchy rather than slow, and needless layout
       is what that feels like.

       So: a memo per node, and nothing is touched unless the value
       actually moved. */
    var memo = new Map();
    function put(node, key, val) {
      if (!node) return;
      var k = node, m = memo.get(k);
      if (!m) { m = {}; memo.set(k, m); }
      if (m[key] === val) return;
      m[key] = val;
      if (key === 'text') node.textContent = val;
      else if (key === 'html') node.innerHTML = val;
      else node.style[key] = val;
    }
    /* The hit marker's four diagonals, rotated once. */
    var hb = el.hit.querySelectorAll('b');
    [[-9, -9, 45], [9, -9, -45], [-9, 9, -45], [9, 9, 45]].forEach(function (d, i) {
      hb[i].style.left = (d[0] - 5) + 'px';
      hb[i].style.top = (d[1] - 1) + 'px';
      hb[i].style.transform = 'rotate(' + d[2] + 'deg)';
    });

    var feed = [];
    var hitAt = -9, hitKill = false;
    var marks = [];

    function you() { return M.you; }
    function nameOf(id) { return id == null ? '?' : M.people[id].name; }
    function sideOf(id) { return id != null && M.people[id].team === you().team ? 'us' : 'them'; }

    return {
      el: el,
      /* Every kill in the match goes past here, whoever made it, so the
         feed is the match's own record rather than a thing the player's
         own code happens to notice. */
      onEvent: function (ev) {
        if (ev.kind === 'kill') {
          feed.unshift('<div><b class="' + sideOf(ev.by) + '">' + esc(nameOf(ev.by))
            + '</b> <span class="wp">' + (ev.head ? 'head shot' : (ev.weapon || 'killed'))
            + '</span> <b class="' + sideOf(ev.who) + '">' + esc(nameOf(ev.who)) + '</b></div>');
          feed = feed.slice(0, 5);
          el.feed.innerHTML = feed.join('');
          if (ev.by === you().id) { hitAt = M.time; hitKill = true; }
          if (ev.who === you().id) marks.push({ t: M.time, from: null });
        } else if (ev.kind === 'plant') {
          feed.unshift('<div><b class="' + sideOf(ev.who) + '">' + esc(nameOf(ev.who))
            + '</b> <span class="wp">planted at ' + esc(ev.site) + '</span></div>');
          el.feed.innerHTML = feed.slice(0, 5).join('');
        } else if (ev.kind === 'defuse') {
          feed.unshift('<div><b class="' + sideOf(ev.who) + '">' + esc(nameOf(ev.who))
            + '</b> <span class="wp">defused it</span></div>');
          el.feed.innerHTML = feed.slice(0, 5).join('');
        } else if (ev.kind === 'roundEnd') {
          feed.unshift('<div><span class="wp">round to </span><b class="'
            + (ev.winner === you().team ? 'us' : 'them') + '">'
            + (ev.winner === you().team ? 'your side' : 'them') + '</b> <span class="wp">&mdash; '
            + esc(ev.why) + '</span></div>');
          el.feed.innerHTML = feed.slice(0, 5).join('');
        }
      },
      /* A line in the kill feed that is not a kill. Used when the
         watchdog gives something up, because a game that quietly
         changes how it looks is a game that looks broken. */
      say: function (text) {
        feed.unshift('<div><span class="wp">' + esc(text) + '</span></div>');
        feed = feed.slice(0, 5);
        el.feed.innerHTML = feed.join('');
      },
      hitMark: function (kill) { hitAt = M.time; hitKill = !!kill; },
      tookFrom: function (from) { marks.push({ t: M.time, from: from }); },

      paint: function (spread, showBoard, aim) {
        var p = you();
        var w = M.people[p.id].guns[p.held];

        /* crosshair: the gap IS the cone */
        /* Rounded to the pixel before it is compared, because a cone
           that drifts by a thousandth of a degree is a new string every
           frame and a new layout with it. */
        /* NOT WHILE YOU ARE IN THE SUIT. This ran every frame and put
           the crosshair straight back after the suit had hidden it --
           two owners of one class, and the one that runs last wins.
           The suit marks the root and this defers to it, which is the
           only arrangement of the two that cannot flicker. */
        el.cross.classList.toggle('hide',
          (aim || 0) > 0.55 || root.classList.contains('nogun'));
        var gap = Math.round(Math.max(3, Math.min(60, spread * 640)));
        put(el.xUp, 'top', (-gap - 9) + 'px');
        put(el.xDn, 'top', gap + 'px');
        put(el.xLf, 'left', (-gap - 9) + 'px');
        put(el.xRt, 'left', gap + 'px');

        var since = M.time - hitAt;
        el.hit.classList.toggle('kill', hitKill);
        el.hit.classList.toggle('on', since < 0.05);
        el.hit.classList.toggle('fade', since >= 0.05 && since < 0.45);

        /* the arcs pointing at whoever hit you */
        marks = marks.filter(function (m) { return M.time - m.t < 1.1; });
        if (el.dmg.childElementCount !== marks.length) {
          el.dmg.innerHTML = marks.map(function () { return '<i></i>'; }).join('');
        }
        var kids = el.dmg.children;
        for (var i = 0; i < marks.length; i++) {
          var m = marks[i], a = 0;
          if (m.from) {
            a = Math.atan2(m.from.pos.x - p.pos.x, m.from.pos.z - p.pos.z) - p.yaw;
          }
          kids[i].style.transform = 'rotate(' + (-a * 180 / Math.PI) + 'deg)';
          kids[i].style.opacity = String(Math.max(0, 1 - (M.time - m.t) / 1.1));
        }

        put(el.us, 'text', String(M.score[p.team]));
        put(el.them, 'text', String(M.score[p.team === 'a' ? 'b' : 'a']));
        put(el.mode, 'text', M.mode.name);
        if (M.mode.bomb) {
          put(el.clock, 'text', 'ROUND ' + M.round + '  '
            + clock(Math.max(0, M.mode.seconds + 4.5 - M.roundTime)));
          var B = M.bomb;
          el.bomb.classList.toggle('armed', !!(B && B.planted));
          put(el.bomb, 'text', !B ? ''
            : B.planted ? ('the bomb is down — ' + clock(45 - (M.time - B.plantAt)))
              : (B.carrier === p.id ? 'you have the bomb'
                : (B.attackers === p.team ? 'your side is attacking' : 'defend both sites')));
        } else {
          put(el.clock, 'text', clock(M.mode.minutes * 60 - M.time));
          el.bomb.textContent = '';
        }

        put(el.hpn, 'text', String(Math.max(0, Math.round(p.hp))));
        put(el.hpbar, 'width', Math.round(Math.max(0, Math.min(100, p.hp))) + '%');
        el.hp.classList.toggle('low', p.hp < 35);
        put(el.who, 'text', p.name + '  ·  your side');

        put(el.gname, 'text', w.name);
        put(el.mag, 'text', String(p.ammo[p.held]));
        put(el.res, 'text', String(p.reserve[p.held]));
        put(el.re, 'text', p.reloadUntil > M.time ? 'reloading'
          : (p.ammo[p.held] === 0 ? 'press R' : ''));

        /* dead */
        var dead = !p.alive && !M.over;
        el.dead.classList.toggle('hide', !dead);
        if (dead) {
          var last = null;
          for (var k = M.events.length - 1; k >= 0; k--) {
            if (M.events[k].kind === 'kill' && M.events[k].who === p.id) { last = M.events[k]; break; }
          }
          put(el.deadBy, 'html', last && last.by != null
            ? ('killed by <b>' + esc(nameOf(last.by)) + '</b>'
              + (last.weapon ? ' <span class="wp">with the ' + esc(last.weapon) + '</span>' : '')
              + (last.head ? ' <span class="wp">&mdash; head shot</span>' : ''))
            : 'you are out of the round');
          put(el.deadN, 'text', M.mode.bomb ? '—'
            : String(Math.max(0, Math.ceil(p.respawnAt - M.time))));
        }

        /* scoreboard */
        el.board.classList.toggle('hide', !showBoard || M.over);
        if (showBoard && !M.over) put(el.board, 'html', boardHtml(M));

        /* the end */
        el.over.classList.toggle('hide', !M.over);
        if (M.over && !el.over.dataset.done) {
          el.over.dataset.done = '1';
          var won = M.winner === p.team;
          el.over.innerHTML = '<div class="won ' + (won ? 'us' : 'them') + '">'
            + (M.winner == null ? 'Drawn' : (won ? 'Your side won' : 'You lost')) + '</div>'
            + '<div class="sub">' + esc(M.mode.name) + ' &middot; ' + M.score[p.team]
            + ' to ' + M.score[p.team === 'a' ? 'b' : 'a'] + '</div>'
            + boardHtml(M)
            + '<div class="ends"><div class="go again">Play again</div>'
            + '<div class="go lobby">Return to lobby</div></div>';
        }
      },
    };
  }

  function boardHtml(M) {
    var rows = M.scoreboard();
    return '<div class="board" style="position:static;transform:none;width:auto;margin-top:20px">'
      + '<h3><span>' + esc(M.mapId) + '</span><span class="sp"></span><span>'
      + esc(M.mode.name) + '</span></h3>'
      + '<table><tr><th>Player</th><th>Gun</th><th>K</th><th>D</th><th>Dmg</th><th>Best</th></tr>'
      + rows.map(function (r) {
        return '<tr class="' + r.team + (r.id === M.you.id ? ' me' : '') + '">'
          + '<td>' + esc(r.name) + (r.bot ? ' <span class="bot">' + esc(r.skill) + '</span>' : '')
          + '</td><td>' + esc(r.gun) + '</td><td>' + r.kills + '</td><td>' + r.deaths
          + '</td><td>' + r.damage + '</td><td>' + r.best + '</td></tr>';
      }).join('')
      + '</table></div>';
  }

  /* ================================================================
     THE PAD'S POINTER
     ================================================================
     A controller cannot press a button that only answers to a mouse.
     The end-of-match screen was exactly that -- Play Again and Return
     to Lobby were click handlers and nothing else -- so a pad player
     who finished a match could not start another one or leave.

     The fix could have been focus navigation on that one screen. This
     is a pointer instead, because there is more than one screen and
     more will be written: it can press anything the mouse can press,
     including every pane that existed before it did.

     THE CHORD IS ALL FOUR DIRECTIONS AT ONCE. Not a button, because
     every button on a pad is already doing something in a firefight,
     and not a menu setting, because the moment you need it is the
     moment you cannot reach the menu. All four at once is a thing your
     thumb cannot do by accident.
     ================================================================ */
  var DPAD = { up: 12, down: 13, left: 14, right: 15 };

  function makePointer(root, canvas) {
    var el = root.querySelector('.curs');
    var badge = root.querySelector('.padbadge');
    var on = false, x = 0, y = 0, chord = false, pressed = false, wasA = false;
    try { on = W.localStorage.getItem('b9.padcursor') === '1'; } catch (e) { on = false; }

    function paint() {
      el.classList.toggle('hide', !on);
      badge.classList.toggle('hide', !on);
      if (on) el.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px)';
    }

    function setOn(v) {
      on = !!v;
      try { W.localStorage.setItem('b9.padcursor', on ? '1' : '0'); } catch (e) { /* off */ }
      if (on) {
        x = W.innerWidth * 0.5; y = W.innerHeight * 0.5;
        /* The mouse look has to let go, or moving the stick aims the
           gun and the pointer at the same time. */
        if (document.exitPointerLock) document.exitPointerLock();
      }
      paint();
    }

    /* Driven straight off the raw pad rather than through the command
       the game reads, so the pointer works on screens where nothing is
       reading commands at all -- which is every screen after the match
       has ended. */
    function poll(dt, gp) {
      if (!gp) return false;
      var b = gp.buttons || [];
      var down = function (i) { return !!(b[i] && (b[i].pressed || b[i].value > 0.5)); };
      var all = down(DPAD.up) && down(DPAD.down) && down(DPAD.left) && down(DPAD.right);
      if (all && !chord) setOn(!on);
      chord = all;
      if (!on) return false;

      var ax = gp.axes || [];
      var sx = Math.abs(ax[0] || 0) > 0.16 ? ax[0] : 0;
      var sy = Math.abs(ax[1] || 0) > 0.16 ? ax[1] : 0;
      /* The right stick as well, because which one a player reaches
         for is a matter of taste and both are free while a pointer is
         up. */
      if (!sx && Math.abs(ax[2] || 0) > 0.16) sx = ax[2];
      if (!sy && Math.abs(ax[3] || 0) > 0.16) sy = ax[3];
      var sp = 980 * dt;
      x = Math.max(0, Math.min(W.innerWidth, x + sx * sp));
      y = Math.max(0, Math.min(W.innerHeight, y + sy * sp));

      /* A is the click. elementFromPoint means it presses whatever is
         under it, which is the whole point -- no screen has to know
         the pointer exists. */
      var a = down(0);
      if (a && !wasA) {
        pressed = true;
        var t = document.elementFromPoint(x, y);
        if (t && t.click) t.click();
      } else if (!a && wasA) pressed = false;
      wasA = a;
      el.classList.toggle('press', pressed);
      paint();
      return true;
    }

    paint();
    return { poll: poll, get on() { return on; }, set: setOn,
      get at() { return { x: x, y: y }; } };
  }

  /* ================================================================
     SETTINGS
     ================================================================
     The pad reads invertX and invertY out of b9.pad.v1 and nothing in
     multiplayer could ever write them. So a player whose stick is the
     wrong way round had exactly one remedy available -- telling me,
     and waiting for me to guess the sign correctly, which I did not.

     Every control in here applies the moment it is pressed: the pad
     re-reads its config twice a second by design, and the graphics
     tier is applied straight to the renderer. Nothing needs a restart
     and nothing is lost on one -- it all goes to localStorage under
     the same keys zombies uses, so a choice made in one is a choice
     made in both. */
  function makeSettings(root, game, pad, ctl) {
    var el = root.querySelector('.opt');
    var open = false;

    function mouseSens() {
      var v = 1;
      try { v = parseFloat(W.localStorage.getItem('b9.mouse') || '1') || 1; } catch (e) { v = 1; }
      return Math.max(0.2, Math.min(4, v));
    }
    function setMouse(v) {
      v = Math.max(0.2, Math.min(4, Math.round(v * 10) / 10));
      try { W.localStorage.setItem('b9.mouse', String(v)); } catch (e) { /* off */ }
      if (ctl.onMouse) ctl.onMouse(v);
      return v;
    }
    function tier() {
      return game.renderer ? game.renderer.qualityName : 'normal';
    }

    function paint() {
      var c = pad.config();
      el.querySelectorAll('[data-t]').forEach(function (b) {
        var on = !!c[b.getAttribute('data-t')];
        b.textContent = on ? 'On' : 'Off';
        b.classList.toggle('on', on);
      });
      var sv = el.querySelector('.val');
      if (sv) sv.textContent = (c.sensitivity || 1).toFixed(1);
      var mv = el.querySelector('.mval');
      if (mv) mv.textContent = mouseSens().toFixed(1);
      var t = tier();
      el.querySelectorAll('[data-g]').forEach(function (b) {
        b.classList.toggle('on', b.getAttribute('data-g') === t);
      });
    }

    el.addEventListener('click', function (ev) {
      var b = ev.target.closest ? ev.target.closest('button') : null;
      if (!b) return;
      var c = pad.config();
      if (b.hasAttribute('data-t')) {
        var k = b.getAttribute('data-t');
        var next = {}; next[k] = !c[k];
        pad.setConfig(next);
      } else if (b.hasAttribute('data-s')) {
        var step = b.getAttribute('data-s') === '+' ? 0.1 : -0.1;
        pad.setConfig({ sensitivity: Math.max(0.2,
          Math.min(4, Math.round(((c.sensitivity || 1) + step) * 10) / 10)) });
      } else if (b.hasAttribute('data-m')) {
        setMouse(mouseSens() + (b.getAttribute('data-m') === '+' ? 0.1 : -0.1));
      } else if (b.hasAttribute('data-g')) {
        var want = b.getAttribute('data-g');
        game.renderer.setQuality(want);
        game.renderer.resize(game.canvas.clientWidth || W.innerWidth,
          game.canvas.clientHeight || W.innerHeight);
        try { W.localStorage.setItem('b9.graphics', want); } catch (e) { /* off */ }
      } else if (b.classList.contains('resume')) {
        api.close(true);
        return;
      } else if (b.classList.contains('quit')) {
        if (ctl.onQuit) ctl.onQuit();
        return;
      }
      paint();
    });

    var api = {
      get open() { return open; },
      show: function () {
        if (open) return;
        open = true;
        paint();
        el.classList.remove('hide');
        if (document.exitPointerLock) document.exitPointerLock();
      },
      close: function (relock) {
        if (!open) return;
        open = false;
        el.classList.add('hide');
        if (relock && ctl.onResume) ctl.onResume();
      },
      toggle: function () { if (open) api.close(true); else api.show(); },
      mouseSens: mouseSens,
    };
    return api;
  }

  /* ================================================================
     THE REPLAY: KILL CAM AND BEST PLAY
     ================================================================
     Both are the same machine pointed at two different moments.

     The match records a rolling tape of where everybody was and what
     they were doing (see mp-match). A replay hands that tape back to
     the same actors -- the real bodies, the real animator -- and takes
     the camera off the player for a few seconds. Nothing is duplicated:
     there is no second set of ghosts to keep in step with the first,
     because two sets of bodies is how a replay ends up showing a man
     shooting at where you are NOW.

     The difference between the two is only the camera and the label:

       kill cam    sits inside the killer's head and looks where he was
                   looking, which is the point of it -- you get to see
                   what he saw, including yourself walking into it.
       best play   sits behind the man who made it, because a highlight
                   is watched, not inhabited, and a first-person clip of
                   somebody else's double kill is just a shaky corridor.

     Both are skippable. A replay you cannot skip is a punishment. */

  /* Every actor a body is made of: the rigged meshes, the head and the
     bits screwed to it, the gear. Hiding "the actor" hides a capsule
     and leaves a floating head. */
  function bodyParts(actor, fn) {
    if (!actor) return;
    var seen = [];
    var walk = function (a) {
      if (!a || seen.indexOf(a) >= 0) return;
      seen.push(a);
      fn(a);
      if (a.children) for (var i = 0; i < a.children.length; i++) walk(a.children[i]);
    };
    walk(actor);
    if (actor.rigged) for (var i = 0; i < actor.rigged.length; i++) walk(actor.rigged[i]);
    ['head', 'neck', 'eyes', 'hair', 'beard', 'brows', 'balaclava'].forEach(function (k) {
      if (actor[k]) walk(actor[k]);
    });
    if (actor.gear) for (var j = 0; j < actor.gear.length; j++) walk(actor.gear[j]);
  }

  /* Remember what a part looked like the first time we touched it, so
     putting the world back does not turn on a scalp the operator was
     never given. */
  function setBody(actor, visible) {
    bodyParts(actor, function (a) {
      if (a.__vis0 === undefined) a.__vis0 = a.visible !== false;
      a.visible = visible === null ? a.__vis0 : (visible && a.__vis0);
    });
  }

  function makeReplay(root, game, M, vm) {
    var q = function (sel) { return root.querySelector(sel); };
    var el = { wrap: q('.cam'), kind: q('.cam .kind'), nm: q('.cam .nm'),
      det: q('.cam .det'), prog: q('.cam .prog i'), you: q('.cam .you') };
    var S = null, buf = [];

    function begin(spec) {
      if (S) return false;
      if (!spec || !spec.clip || spec.to <= spec.from) return false;
      S = spec;
      S.t = spec.from;
      M.replaying = true;
      vm.hide();
      /* Your own body is hidden for the whole match because the camera
         lives inside it. For the next few seconds the camera is
         somewhere else, so it has to come back -- being shot in the
         back by a man you then watch shoot nobody is not a kill cam. */
      for (var i = 0; i < M.people.length; i++) setBody(M.people[i].actor, true);
      if (spec.inside != null && M.people[spec.inside]) setBody(M.people[spec.inside].actor, false);
      root.classList.add('cam');
      el.wrap.classList.remove('hide');
      el.kind.textContent = spec.kind;
      el.nm.textContent = spec.name || '';
      el.det.innerHTML = spec.detail || '';
      el.prog.style.width = '0%';
      return true;
    }

    function end() {
      if (!S) return;
      S = null;
      M.replaying = false;
      M.unpose();
      for (var i = 0; i < M.people.length; i++) setBody(M.people[i].actor, null);
      setBody(M.you.actor, false);      // back inside your own head
      root.classList.remove('cam');
      el.wrap.classList.add('hide');
      if (el.you) el.you.classList.add('hide');
    }

    /* Advance the clip and drive the camera. Returns false the frame it
       runs out, so the caller knows the world is theirs again. */
    function update(dt) {
      if (!S) return false;
      S.t += dt * (S.rate || 1);
      if (S.t >= S.to) { end(); return false; }
      var list = M.tapeAt(S.clip, S.t, buf);
      if (!list) { end(); return false; }
      M.pose(list, dt);

      var f = (S.t - S.from) / Math.max(0.001, S.to - S.from);
      el.prog.style.width = (f * 100).toFixed(1) + '%';

      /* ---- and where you are in it ----
         Your own body on the tape, a little over your head, in the
         same amber everything you can act on uses. Hidden when you are
         behind the camera or off the sides, because a marker pinned to
         the edge of the screen pointing at nothing is worse than no
         marker at all. */
      if (el.you) {
        var mineIdx = M.you ? M.you.id : -1;
        var mine = mineIdx >= 0 ? list[mineIdx] : null;
        var sp = (mine && mine.alive && game.project)
          ? game.project([mine.x, mine.y + EYE + 0.34, mine.z]) : null;
        if (sp && !sp.offscreen) {
          el.you.classList.remove('hide');
          el.you.style.left = sp.x.toFixed(0) + 'px';
          el.you.style.top = sp.y.toFixed(0) + 'px';
          /* Fainter far away, so it does not shout over a man who is a
             hundred metres off and not the point of the shot. */
          el.you.style.opacity = Math.max(0.35,
            Math.min(1, 1.25 - sp.depth / 90)).toFixed(2);
        } else el.you.classList.add('hide');
      }

      var EYE = W.MP_MATCH.EYE;
      if (S.chase) {
        /* Behind and above, with a slow drift across the shot so the
           frame is moving even when the man in it is not. */
        var a = list[S.star] || list[0];
        var fw = { x: Math.sin(a.yaw), z: Math.cos(a.yaw) };
        var rt = { x: -Math.cos(a.yaw), z: Math.sin(a.yaw) };     // see RIGHT, mp-match
        var sw = Math.sin(f * Math.PI) * 1.15;
        var back = 3.5, lift = 1.05;
        var hx = a.x, hy = a.y + EYE, hz = a.z;
        var cx = hx - fw.x * back + rt.x * sw;
        var cy = hy + lift;
        var cz = hz - fw.z * back + rt.z * sw;
        /* PULL IN IF THERE IS A WALL BEHIND HIM. A chase camera that
           reverses into the building he is standing against shows the
           inside of a wall with a man's name over it, which is what
           the first Best Play screenshot came back as. Cast from his
           head out to where the camera wants to be, and stop short of
           whatever it hits. */
        var dx = cx - hx, dy = cy - hy, dz = cz - hz;
        var len = Math.hypot(dx, dy, dz) || 1e-6;
        try {
          var hit = game.raycast([hx, hy, hz], [dx / len, dy / len, dz / len], len,
            function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); });
          /* The hit reports a POINT, not a distance -- mp-match's own
             nav sweep measures it off hit.point for the same reason. */
          var hd = hit && hit.point
            ? Math.hypot(hit.point.x - hx, hit.point.y - hy, hit.point.z - hz)
            : (hit && hit.distance != null ? hit.distance : Infinity);
          if (hd < len) {
            /* Not closer than a bit over half. Pulled right in, the
               camera sits on the back of his head and the shot stops
               being a chase and becomes a hat. Clipping a corner of
               wall is the lesser evil. */
            var k = Math.max(0.55, (hd - 0.28) / len);
            cx = hx + dx * k; cy = hy + dy * k; cz = hz + dz * k;
          }
        } catch (e) { /* no physics on this map: keep the wide shot */ }
        game.lookAt([cx, cy, cz], [a.x + fw.x * 1.2, hy - 0.15, a.z + fw.z * 1.2]);
      } else {
        var e = list[S.eye] || list[0];
        var cp = Math.cos(e.pitch);
        game.lookAt([e.x, e.y + EYE, e.z],
          [e.x + Math.sin(e.yaw) * cp, e.y + EYE - Math.sin(e.pitch), e.z + Math.cos(e.yaw) * cp]);
      }
      return true;
    }

    return {
      begin: begin, update: update, stop: end,
      get active() { return !!S; },
      /* What the replay currently believes, for a test to check the
         camera against. Twice now a check has compared the camera to
         where somebody is NOW and called a working kill cam broken:
         the whole point of the thing is that the man on the screen is
         not where he is any more. */
      debug: function () {
        if (!S) return null;
        var e = buf[S.chase ? S.star : S.eye] || buf[0] || {};
        return { t: S.t, from: S.from, to: S.to, chase: !!S.chase,
          who: S.chase ? S.star : S.eye,
          x: e.x, y: e.y, z: e.z, yaw: e.yaw, pitch: e.pitch };
      },
    };
  }

  /* The kill cam's clip, cut from the rolling tape. It cannot be cut at
     the instant of death, because the second AFTER the shot has not
     been recorded yet -- so the caller waits, and this is what it waits
     for. Lead-in is long enough to see him line you up. */
  function killCamClip(M, killT) {
    var span = M.recSpan();
    if (!span) return null;
    var from = Math.max(span.from, killT - 2.6);
    var to = Math.min(span.to, killT + 0.9);
    if (to - from < 0.5) return null;
    return { clip: M.clip(from, to), from: from, to: to };
  }

  /* ================================================================
     THE LOOP
     ================================================================ */

  function start(opts) {
    opts = opts || {};
    var canvas = typeof opts.canvas === 'string'
      ? document.querySelector(opts.canvas) : (opts.canvas || document.querySelector('#game'));

    var st = document.createElement('style');
    st.textContent = CSS + (W.MP_STREAKS ? W.MP_STREAKS.CSS : '')
      + (W.MP_BERSERKER ? W.MP_BERSERKER.CSS : '');
    document.head.appendChild(st);
    var root = document.createElement('div');
    root.id = 'mpui';
    root.innerHTML = MARKUP;
    document.body.appendChild(root);

    /* THE GRAPHICS TIER YOU ALREADY CHOSE.
       Zombies has a graphics menu and saves the choice; multiplayer
       had none and always booted at whatever detectQuality() guessed
       from the RAM and the core count -- which say nothing about the
       graphics card. Somebody who had set zombies to Low was still
       handed two 2560px shadow cascades and bloom in here. */
    var saved = null;
    try { saved = W.localStorage.getItem('b9.graphics'); } catch (e) { saved = null; }
    var TIER = { retro: 'retro', low: 'low', normal: 'normal', high: 'high', ultra: 'ultra' };
    var game = W.LE.create({ canvas: canvas, gravity: -19.6,
      quality: opts.quality || TIER[saved] || undefined });
    /* The rest of the fight: other people's weapons, their feet, and
       the tick that says a shot of yours connected. See makeWorldAudio. */
    var worldAudio = makeWorldAudio(game);

    /* AND A WATCHDOG, because a guess about the hardware that is never
       checked against the result is how a machine ends up rendering
       two frames a second with nobody noticing. It only steps down,
       and it says so when it does. */
    game.autoQuality({
      target: opts.fpsTarget || 40,
      onChange: function (tier, fps, step) {
        if (hud && hud.say) hud.say('graphics set to ' + tier + ' — ' + fps + ' fps');
        try { W.console.log('[mp] quality -> ' + tier + ' at ' + fps + ' fps (step ' + step + ')'); }
        catch (e) { /* no console */ }
      },
    });

    var M = W.MP_MATCH.start({
      game: game,
      mapId: opts.mapId || 'town',
      mode: opts.mode || 'tdm',
      seed: opts.seed || (Date.now() & 0x7fffffff),
      you: { name: opts.name || 'YOU', loadout: opts.loadout,
        operator: opts.operator || 'delta' },
      onEvent: function (ev) { hud.onEvent(ev); },
    });

    /* YOU ARE INSIDE YOUR OWN HEAD, so it must not be drawn.
     *
       Every combatant gets a full operator body, and the camera sits at
       eye height inside yours -- so the back of your own face, your own
       eyes and the inside of your own helmet were between the camera
       and the world. "I can see through my character's face in first
       person" is exactly that, and it is one line: hide every actor
       that belongs to you.

       The body still EXISTS -- it is what everybody else sees, and what
       the hit tests use -- it is only not rendered for the one person
       standing inside it. */
    function hideOwnBody() { setBody(M.you && M.you.actor, false); }
    hideOwnBody();

    var hud = makeHud(root, M);
    var input = makeInput(root, canvas);
    var pad = makePad(opts);
    var vm = makeViewmodel(game);
    var replay = makeReplay(root, game, M, vm);
    var pointer = makePointer(root, canvas);
    /* Every gun this player can end the match holding, built now. */
    vm.warm((M.you.guns || []).map(function (w) { return w.id || w.base; }));
    /* And what is bolted to them. */
    (function () {
      var lo = M.you.loadout || {};
      var held = M.you.guns[M.you.held];
      var which = (held && (held.id || held.base)) === lo.secondary
        ? lo.secondaryAtt : lo.primaryAtt;
      vm.fit(which || []);
    })();

    var yaw = M.you.yaw, pitch = 0;
    var sens = (opts.sensitivity || 1) * 0.0022;
    /* Escape opens the settings, which is also where the pointer lock
       goes when the browser takes it away -- it does that on Escape
       whatever the page wants, so the pane may as well be the thing
       that appears. */
    var settings = makeSettings(root, game, pad, {
      onResume: function () { if (canvas.requestPointerLock) canvas.requestPointerLock(); },
      onQuit: function () {
        if (opts.onQuit) opts.onQuit(M);
        else W.location.href = 'bunker-nine.html';
      },
      onMouse: function (v) { sens = v * 0.0022; },
    });
    sens = settings.mouseSens() * 0.0022;
    input.onUnlock(function () { if (!over && !M.over) settings.show(); });
    /* ---- the killstreak rail ---- */
    var STREAK_USES = 'b9.mp.streakUses.v1';
    function usesOf(id) {
      try {
        var o = JSON.parse(W.localStorage.getItem(STREAK_USES) || '{}');
        return o[id] || 0;
      } catch (e) { return 0; }
    }
    function bumpUse(id) {
      try {
        var o = JSON.parse(W.localStorage.getItem(STREAK_USES) || '{}');
        o[id] = (o[id] || 0) + 1;
        W.localStorage.setItem(STREAK_USES, JSON.stringify(o));
      } catch (e) { /* storage off: it simply never levels */ }
    }
    var berserk = null;
    var rail = W.MP_STREAKS ? W.MP_STREAKS.make(root, M, {
      pad: pad, input: input, uses: usesOf,
      callIn: function (def, level) {
        bumpUse(def.id);
        hud.say(def.name.toLowerCase() + ' — called in');
        if (def.id === 'k-berserker' && W.MP_BERSERKER) {
          if (!berserk) berserk = W.MP_BERSERKER.make(root, M, game, {
            pad: pad, input: input,
            onEnd: function () { hud.say('the suit is gone'); },
          });
          berserk.callIn(level);
          return;
        }
        if (M.callStreak) M.callStreak(def, level);
      },
    }) : null;

    var wasSuited = false;
    /* The crosshair and the ammunition counter belong to a gun you are
       holding, and in the suit you are not holding one. */
    function el0Hide(on) {
      root.classList.toggle('nogun', !!on);
      var g = root.querySelector('.gun');
      if (g) g.classList.toggle('hide', !!on);
    }
    /* The suit stands between a round and the man in it. */
    M.absorbHit = function (who, amount) {
      if (!berserk || who !== M.you) return false;
      return berserk.absorb(amount);
    };

    var stanceY = W.MP_MATCH.EYE;
    /* How hard the last shot shoved, 0 to about 1.6, decaying fast. */
    var punch = 0;
    var kick = 0, bob = 0, bobT = 0, lastHp = M.you.hp, wasAlive = true;
    var adsT = 0;
    /* How much of the inspect is left to run, how strongly it is
       applied, and how long the reload button has been held down --
       the pad's way of asking for one.

       `insW` is the whole of the cancel. Setting the clock to zero
       teleports the weapon back to the carry between two frames; this
       fades the pose out over INSPECT_CANCEL instead, from wherever it
       had got to, while the clock keeps running underneath. */
    var insT = 0, insW = 1, rlHeld = 0, swapRang = false;
    var over = false;
    /* The kill cam cannot start the instant you die: the second after
       the shot has not been recorded yet, and a kill cam that stops on
       the frame of the kill is a still photograph. So the death is
       noted, and the clip is cut a beat later. */
    var camPend = null, aliveWas = true, bestTried = false;
    /* How far through the end-of-match slow motion we are, 0 to 1. */
    var endT = 0, endWall = 0;

    /* Being shot has to point at whoever did it, and the match reports
       a kill but not a graze. The player's own health falling is the
       signal, and the nearest enemy who can see you is the direction --
       which is a guess, and is the same guess every shooter makes. */
    function watchDamage() {
      var p = M.you;
      if (p.hp < lastHp - 0.5 && p.alive) {
        var best = null, bd = 1e9;
        for (var i = 0; i < M.people.length; i++) {
          var q = M.people[i];
          if (q.team === p.team || !q.alive) continue;
          var d = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
          if (d < bd) { bd = d; best = q; }
        }
        hud.tookFrom(best);
        pad.rumble(0.55, 0.16);
      }
      lastHp = p.hp;
    }

    /* The shot that killed you, from the match's own record rather than
       from anything this file guessed. */
    function myLastDeath() {
      for (var k = M.events.length - 1; k >= 0; k--) {
        var e = M.events[k];
        if (e.kind === 'kill' && e.who === M.you.id) return e;
      }
      return null;
    }

    function killCamDetail(e) {
      var d = [];
      if (e.weapon) d.push('with the ' + esc(e.weapon));
      if (e.head) d.push('head shot');
      if (e.range > 1) d.push(Math.round(e.range) + ' m');
      return d.join(' &nbsp;&middot;&nbsp; ');
    }

    function bestPlayDetail(b) {
      var d = [];
      d.push(b.kills > 1 ? b.kills + ' kills in four seconds' : 'one kill');
      if (b.heads) d.push(b.heads > 1 ? b.heads + ' head shots' : 'head shot');
      if (b.range > 1) d.push('at ' + Math.round(b.range) + ' m');
      return d.join(' &nbsp;&middot;&nbsp; ');
    }

    /* The bindings, re-read twice a second, the same way the pad
       re-reads its config: a rebind made in the pause screen applies
       on the next frame and nothing has to be restarted, which is the
       half of "the rebinding has to actually apply" that is easy to
       get wrong by caching it once at startup. */
    var K = bindsFor(), bindAge = 0;

    function frame(dt) {
      if (over) return;
      var p = M.you;
      bindAge += dt;
      if (bindAge > 0.5) { bindAge = 0; K = bindsFor(); }

      /* Settings open: the world keeps turning but you do not steer it.
         Reading the stick while a menu is up is how a player comes back
         to find they have walked into a wall for thirty seconds. */
      if (input.once(K.quit)) settings.toggle();
      if (settings.open) {
        M.update(dt);
        input.endFrame();
        return;
      }

      /* ---- a replay owns the screen while it runs ----
         The match keeps simulating underneath it: respawn timers, the
         round clock, eleven other people. Pausing a twelve-man match
         so that one of them can watch himself die would stop
         everybody else's game. */
      if (replay.active) {
        M.update(dt);
        /* THE SAME CLOCK THE TAPE IS ON. The engine clamps a long frame
           at 0.1 s and the match clamps its tick at 0.05, so on a slow
           machine match time runs slower than wall time -- and a replay
           advanced by wall time would rip through a three-second clip
           in eight frames and show a slideshow. */
        var rdt = Math.min(dt, 0.05);
        var sk = { forward: 0, right: 0, lookX: 0, lookY: 0, fire: false, jump: false };
        pad.poll(rdt, sk);
        var skip = input.once(K.jump) || input.once(K.quit)
          || input.buttons.fire || sk.fire || sk.jump;
        var running = replay.update(rdt);
        /* A respawn ends it whatever the clip says -- being alive and
           moving while the screen shows somebody else is worse than a
           kill cam cut short. */
        if (skip || !running || (camPend == null && p.alive && !M.over)) replay.stop();
        input.endFrame();
        return;
      }

      /* ---- the kill cam, a beat after the death ---- */
      if (camPend && !M.over) {
        if (M.time >= camPend.at) {
          var cut = killCamClip(M, camPend.ev.t);
          var by = M.people[camPend.ev.by];
          if (cut && cut.clip && by) {
            replay.begin({
              kind: 'Kill cam', name: by.name, detail: killCamDetail(camPend.ev),
              clip: cut.clip, from: cut.from, to: cut.to,
              eye: camPend.ev.by, inside: camPend.ev.by,
            });
          }
          camPend = null;
          if (replay.active) { input.endFrame(); return; }
        }
      }

      /* ---- the last second of a match ----
         It should not simply stop. The game drops into slow motion as
         the final kill lands, the world slides to a halt, and only
         then does the screen tell you whether you won. A match that
         cuts straight from a firefight to a scoreboard throws away the
         one moment everybody remembers.

         Driven on the engine's own timeScale, so everything slows
         together -- bodies, bullets, the viewmodel, the bob -- rather
         than a few things being lerped while the rest runs on. */
      if (M.over && endT < 1) {
        /* ON WALL TIME, NOT GAME TIME. timeScale scales the dt handed
           to every update hook including this one, so driving the ramp
           from `dt` means the ramp slows down as it slows the game
           down -- and at timeScale 0 it receives dt 0, stops
           advancing, and the result screen never arrives at all. The
           match would simply stop, frozen, forever. */
        var wnow = (W.performance ? W.performance.now() : Date.now()) / 1000;
        var wdt = endWall ? Math.min(0.25, wnow - endWall) : 1 / 60;
        endWall = wnow;
        endT = Math.min(1, endT + wdt / 1.6);
        /* Down to a tenth and then to a stop, on a curve that is
           slowest at the end so the freeze arrives rather than hits. */
        var sl = 1 - endT;
        game.timeScale = Math.max(0, sl * sl * 0.9 + 0.02);
        if (endT >= 1) game.timeScale = 0;
      }
      if (M.over && endT < 0.999) {
        /* Still slowing: the world runs, nothing else happens yet. */
        M.update(dt);
        hud.paint(0.02, false, adsT);
        input.endFrame();
        return;
      }

      /* ---- best play, before the scoreboard ---- */
      if (M.over && !bestTried) {
        bestTried = true;
        var b = M.bestPlay();
        if (b && b.clip) {
          /* Back to real time for the replay -- a highlight played at
             a fiftieth of speed is not a highlight. */
          game.timeScale = 1;
          replay.begin({
            kind: 'Best play', name: b.name, detail: bestPlayDetail(b),
            clip: b.clip, from: b.from, to: b.to,
            star: b.by, chase: true, inside: null, rate: 0.85,
          });
          if (replay.active) { input.endFrame(); return; }
        }
      }

      var d = input.take();
      /* MINUS. The camera's right hand is at -X (see RIGHT in
         mp-match), so increasing yaw swings the view to the LEFT --
         which is why "left is right and right is left on the looking
         controls". */
      yaw -= d[0] * sens;
      pitch += d[1] * sens;
      pitch = Math.max(-1.45, Math.min(1.45, pitch));

      var cmd = {
        yaw: yaw, pitch: pitch,
        forward: (input.any(K.forward) ? 1 : 0) - (input.any(K.back) ? 1 : 0),
        right: (input.any(K.right) ? 1 : 0) - (input.any(K.left) ? 1 : 0),
        run: input.any(K.sprint), jump: input.once(K.jump),
        crouch: input.any(K.crouch),
        reload: input.once(K.reload), swap: input.once(K.swap),
        inspect: input.once(K.inspect), reloadHeld: input.any(K.reload),
        slide: input.once(K.slide), scores: input.any(K.scores),
        fire: input.buttons.fire, aim: input.buttons.aim,
        lookX: 0, lookY: 0,
      };
      /* The pad adds to what the keyboard said rather than replacing
         it, so both are live at once and neither cancels the other --
         which matters more than it sounds, because a player with a pad
         in their hands still hits Escape with the other one. */
      var padOn = pad.poll(dt, cmd);
      /* The command the pad just filled in, published for a test to
         read. This is the pad layer's whole contract -- a button's job
         is to reach the field it is bound to -- and asserting it here
         is far better than guessing at downstream effects: half of
         these have no lasting state at all (`scores` is handed
         straight to hud.paint and forgotten), so a test looking for
         one on the player finds nothing and reports a fault that is
         its own. See engine/test/mppad.test.js. */
      W.MP_LASTCMD = cmd;
      if (padOn) { yaw += cmd.lookX; pitch += cmd.lookY; }
      pitch = Math.max(-1.45, Math.min(1.45, pitch));
      cmd.yaw = yaw; cmd.pitch = pitch;
      /* Coming back from the dead, look the way you were put down
         facing. Without this the camera kept whatever angle you died
         with -- respawn while looking at your own boots and you spend
         the next life looking at the floor, because the match sets the
         spawn yaw on the combatant and this file owns the view. */
      if (!wasAlive && p.alive) { yaw = p.yaw; pitch = 0; }
      wasAlive = p.alive;

      var before = p.ammo[p.held];
      /* The view recoil the match just applied has to come back into
         the angle YOU are holding, or the gun kicks and the camera does
         not and the whole thing is a lie. It is added to your own yaw
         and pitch rather than replacing them: you keep aiming where you
         were aiming, and the gun has moved you off it. Pulling back
         down is then a thing you do with the mouse, which is what
         controlling recoil is. */
      var kUp0 = p.kickUp || 0, kSide0 = p.kickSide || 0;
      var kills0 = p.kills;
      /* IN THE SUIT YOU ARE NOT A MAN WITH A RIFLE. The match's own
         control -- walking, sprinting, firing, reloading, sliding --
         is skipped entirely, because the suit moves you itself and
         "you are limited to what the mech gives you" is a rule, not a
         suggestion. Without this you would be walking at your own
         pace, firing your own weapon, from inside a mech. */
      var suited = !!(berserk && berserk.riding);
      if (!suited) M.control(cmd, dt);
      if (!suited && p.ammo[p.held] < before) {
        /* THE WEAPON IN HAND NOW, not the one `w` happens to hold.
         *
           This read `w`, which is declared four hundred lines further
           down inside `if (p.alive)` -- so on any frame it was the
           PREVIOUS frame's weapon, and on the first shot of a session
           it was undefined and this line threw. A throw here kills the
           rest of the frame: the match still updates, so you keep
           playing, but everything after it in this function -- the
           viewmodel, the HUD, the camera -- stops for that tick. Fire
           on your first frame and the screen hitches.

           Found by the new mpswap.test.js, which watches for page
           errors while it presses the trigger; it is not a new fault,
           it is one nothing had been looking for. */
        var wNow = p.guns[p.held];
        kick = Math.min(1.4, kick + 0.55);
        vm.fired(60 / Math.max(1, (wNow && wNow.rpm) || 600));
        /* The HELD weapon, not the table row: MP_DATA.build has
           already folded the attachments into it, so a longer barrel
           or a different muzzle is heard as well as felt. */
        fireSound(game, p.guns[p.held], p.ammo[p.held] === 0);
      }
      M.update(dt);
      /* EVERYBODY ELSE'S GUNS, FEET AND HITS. After update, so it reads
         the state the match has just settled on; the local player's own
         shot is played above and skipped there by id, or every shot you
         take would be two shots. */
      if (worldAudio) { try { worldAudio(M); } catch (e) { void e; } }
      var dUp = (p.kickUp || 0) - kUp0, dSide = (p.kickSide || 0) - kSide0;
      /* Only the climb is handed to the player. The settle is the gun
         coming back down under its own weight and must NOT drag the
         view with it, or every burst ends where it started and recoil
         costs nothing. */
      if (dUp > 0) {
        pitch -= dUp; yaw -= dSide;
        /* THE SHOVE, which is separate from the climb.
         *
           A big round does two things to a shooter and the game only
           did one of them. The CLIMB is the muzzle rising, and that is
           `pitch -= dUp` above: it is permanent until you pull it back
           down, and it is what recoil control is. The SHOVE is the gun
           coming back into your shoulder and your whole body giving a
           little -- it is over in a tenth of a second and it takes
           nothing away from your aim, and it is the entire reason a
           fifty calibre feels like a fifty calibre and a nine
           millimetre does not.

           Scaled off the weapon's own vertical recoil, so it needs no
           second table and no gun can have one without the other. An
           STG at 0.52 degrees gets almost nothing; the anti-materiel
           rifle at 6.2 throws the camera back a good way and widens
           the field of view as it does, the way a punch does. */
        var w2 = p.guns[p.held];
        var heavy = Math.min(1, ((w2 && w2.rec ? w2.rec[0] : 0.6) - 0.4) / 5.0);
        if (heavy > 0) {
          punch = Math.min(1.6, punch + heavy * 1.25);
          pad.rumble(0.35 + heavy * 0.6, 0.06 + heavy * 0.10);
        } else pad.rumble(0.22, 0.05);
      }
      if (p.kills > kills0) { hud.hitMark(true); pad.rumble(0.8, 0.22); }
      pitch = Math.max(-1.45, Math.min(1.45, pitch));
      watchDamage();

      kick *= Math.pow(0.02, dt);
      var moving = Math.abs(cmd.forward) + Math.abs(cmd.right) > 0.1 && p.grounded;
      bobT += dt * (p.sprinting ? 12 : 7.5) * (moving ? 1 : 0);
      bob = moving ? Math.sin(bobT) * (p.sprinting ? 0.016 : 0.009) : bob * 0.9;

      /* ---- the killstreak rail, and whatever it called in ----
         Polled before the camera, because the Berserker Suit takes the
         camera over completely for as long as it is up. */
      if (rail) rail.poll(dt);
      if (berserk && berserk.active) {
        var shot = berserk.poll(dt, cmd, null);
        if (shot) {
          game.lookAt(shot.eye, shot.at);
          if (shot.fov && game.fieldOfView) game.fieldOfView(shot.fov);
          /* No viewmodel: you are not holding anything in the suit. */
          vm.hide();
          el0Hide(true);
          hud.paint(dt, false, 0);
          input.endFrame();
          return;
        }
        if (berserk.riding === false && berserk.state === 'throw') {
          /* Still you, still your gun, but the arc is on the ground. */
        }
      } else if (wasSuited) {
        wasSuited = false;
        if (game.fieldOfView) game.fieldOfView(55);
        el0Hide(false);
        vm.select(p.guns[p.held]);
      }
      if (berserk && berserk.riding) wasSuited = true;

      /* The camera. Dead, it stays where you fell and looks at the man
         who did it, which is the cheapest kill camera there is and is
         better than a black screen. */
      var eye;
      if (p.alive) {
        /* THE STANCE IS EASED, NOT SWITCHED. Standing, crouched and
           flat are 1.62, 1.20 and 0.38 metres of eye height, and
           jumping between them is what makes a crouch feel like a
           teleport rather than a movement. Prone eases slower than
           crouch because going flat is a fall and getting up is a
           push. */
        var wantEye = p.prone ? 0.38 : (p.crouching ? 1.20 : W.MP_MATCH.EYE);
        var eRate = p.prone ? 12 : 9;
        stanceY += (wantEye - stanceY) * Math.min(1, dt * eRate);
        /* The shove decays in about a sixth of a second. */
        punch *= Math.pow(0.0004, dt);
        if (punch < 0.001) punch = 0;
        var fwdP = Math.cos(pitch);
        eye = {
          x: p.pos.x - Math.sin(yaw) * fwdP * punch * 0.055,
          y: p.pos.y + stanceY + bob + punch * 0.012,
          z: p.pos.z - Math.cos(yaw) * fwdP * punch * 0.055,
        };
        /* And the field of view opens a little with it, which is what
           makes a heavy shot read as force rather than as a wobble. */
        if (game.fieldOfView) game.fieldOfView(55 + punch * 2.6);
        var cp = Math.cos(pitch);
        game.lookAt([eye.x, eye.y, eye.z],
          [eye.x + Math.sin(yaw) * cp, eye.y - Math.sin(pitch), eye.z + Math.cos(yaw) * cp]);
        var w = p.guns[p.held];
        /* Asked of the match, not recomputed here. Two copies of this
           sum is how the crosshair came to draw a cone the weapon did
           not have. */
        var cone = M.coneOf ? M.coneOf(p) : (p.aiming ? w.adsSpread : w.spread);
        /* AIMING IS A MOVEMENT, not a switch. This passed `aim ? 1 : 0`,
           so the gun teleported between the hip and the sight with
           nothing in between -- which is what "I can't aim down sights,
           there's no animation" is. It eases now, and faster to the
           sight than back off it, the way a real one does. */
        var wantAim = (input.buttons.aim || p.aiming) ? 1 : 0;
        var rate = wantAim ? 13 : 9;
        adsT += (wantAim - adsT) * Math.min(1, dt * rate);
        /* MATCH TIME, NOT WALL TIME.
         *
           The match clamps its tick at 0.05 s so one long frame cannot
           teleport anybody, and M.time advances by the clamped figure --
           so on a slow machine match time runs slower than wall time.
           The reload and the swap are both on M.time because they are
           match state. The inspect and the sway were counting raw dt,
           so on a machine rendering at nine frames a second the inspect
           finished in one second of match time while the gun swap
           beside it still took its half second: two animations on the
           same weapon running at different speeds.

           Measured -- mpswap.test.js watched a 2.05 s inspect finish in
           1.0 s of match time -- and the replay code twenty lines up
           already had a comment about this exact clamp. */
        var vdt = Math.min(dt, 0.05);

        /* THE INSPECT, as a clock. Purely a thing you look at -- it
           changes nothing the match knows about -- so it lives here
           rather than in the rules, and anything that matters
           interrupts it: firing, aiming, sprinting, reloading,
           swapping, or dying. That is the whole contract of an
           inspect: it is never in the way. */
        if (cmd.inspect && !insT && !p.reloadUntil && !p.swapUntil
            && !input.buttons.fire && !input.buttons.aim && !p.sprinting) {
          insT = W.LE.INSPECT_TIME; insW = 1;
        }
        /* Held reload is the same request, for a pad with no button to
           spare. Timed here because the pad layer does not know how
           long a frame was. */
        if (cmd.reloadHeld && !p.reloadUntil) rlHeld += vdt; else rlHeld = 0;
        if (rlHeld > 0.42 && !insT && !p.swapUntil && !input.buttons.fire) {
          insT = W.LE.INSPECT_TIME; insW = 1; rlHeld = -9;
        }
        if (insT > 0) {
          insT = Math.max(0, insT - vdt);
          var cancel = input.buttons.fire || input.buttons.aim || p.sprinting
            || p.reloadUntil > M.time || p.swapUntil > M.time || !p.alive;
          if (cancel) insW = Math.max(0, insW - vdt / W.LE.INSPECT_CANCEL);
          if (insW <= 0) insT = 0;
        }

        /* The reload, as a clock rather than as a shape.
         *
           This used to hand the viewmodel `sin(t*PI)` -- the bump that
           drops the gun -- and that is all the viewmodel ever knew
           about a reload. A bump comes back to zero at the end and
           passes through every value twice on the way, so nothing
           downstream could tell fetching a magazine from seating one,
           and the hand had no clock to work to. It gets the linear
           fraction now and derives its own bump; the magazine, the
           clip, the cell, the belt, the shells and the loose rounds
           all hang off this one number. */
        /* THE SWAP'S OWN NOISE: cloth, then the weight of the next
           weapon arriving. The match owns the clock, so this watches
           for a swap appearing rather than being told about one --
           beginSwap is called from three places and none of them can
           reach the audio. */
        if (p.swapUntil > M.time && !swapRang) {
          swapRang = true;
          game.handling('swap');
        } else if (p.swapUntil <= M.time) swapRang = false;

        var rl = 0;
        if (p.reloadUntil > M.time) {
          var total = Math.max(0.2, w.reload || 2.0);
          var left = p.reloadUntil - M.time;
          // Never exactly zero while a reload is running: zero means
          // "not reloading", and the first frame of one is not that.
          rl = Math.max(1e-3, Math.min(1, 1 - left / total));
        }
        vm.place(eye, yaw, pitch, adsT, p.sprinting, kick, bob,
          w.id || w.base || 'm4', rl, dt,
          /* What is left in the magazine, as a fraction, so the column
             of rounds inside it goes down as you shoot. The gun owns
             the rule -- see setRounds on the service arm -- and all
             this has to do is say how full it is. */
          w.mag ? Math.max(0, Math.min(1, p.ammo[p.held] / w.mag)) : 1,
          /* How far through a weapon swap, 0..1. The match owns the
             clock -- the slot changes at its midpoint -- and all this
             does is drop the gun out of the frame around that moment so
             the exchange is never seen. */
          p.swapUntil > M.time && p.swapFor > 0
            ? Math.max(0, Math.min(1, 1 - (p.swapUntil - M.time) / p.swapFor)) : 0,
          // And how far through the inspect.
          insT > 0 ? 1 - insT / W.LE.INSPECT_TIME : 0, insW);
        /* THE CROSSHAIR GOES AWAY AT THE SIGHTS. Leaving it up while
           you are looking through the irons puts two aiming marks on
           the screen that do not agree, and the one that is right is
           the one on the gun. */
        hud.paint(cone * Math.PI / 180, cmd.scores, adsT);
      } else {
        vm.hide();
        eye = { x: p.pos.x, y: p.pos.y + 1.1, z: p.pos.z };
        game.lookAt([eye.x, eye.y + 1.4, eye.z], [p.pos.x, p.pos.y + 1.0, p.pos.z + 0.01]);
        hud.paint(0.02, cmd.scores);
      }

      /* Noted here rather than off the event, because the event fires
         while the match is mid-tick and the tape has not yet recorded
         the frame you fell over in. */
      if (aliveWas && !p.alive && !M.over) {
        var ev = myLastDeath();
        if (ev && ev.by != null && ev.by !== p.id) camPend = { ev: ev, at: M.time + 0.75 };
      }
      aliveWas = p.alive;
      if (p.alive) camPend = null;

      if (M.over && !over && !replay.active) {
        over = true;
        game.timeScale = 1;
        /* The cursor belongs to the end screen from here on. Nothing
           may grab the pointer lock back -- that was the whole reason
           Play Again could not be pressed. */
        root.classList.add('done');
        if (input.wantLock) input.wantLock(false);
        if (document.exitPointerLock) document.exitPointerLock();
        /* TWO WAYS OUT, and there was one.
         *
           A finished match offered "Back to the lobby" and nothing
           else, so the only way to play a second one was to restart
           the whole game. That is not a missing feature, it is a match
           you cannot leave.

           Play again RELOADS rather than tearing the match down in
           place. A match owns actors, corpses, bullet holes, a
           recorder tape, highlight clips and a weapon per combatant,
           and unpicking all of that correctly is a much better way to
           produce a second match with the first one's ghosts in it.
           The world rebuild costs a few seconds and is certainly
           right; that is the correct trade for the thing that has
           been stopping play entirely. */
        /* AND THE POINTER COMES UP BY ITSELF.
         *
           The pad pointer exists precisely because these two buttons
           answer only to a mouse, and it is off until the player holds
           all four d-pad directions at once. That chord is a fine way
           to summon it mid-match, where every button is busy, and a
           useless one here: the screen where you need it is the screen
           where you have no way to learn it exists, and a player who
           does not know the chord is still stuck on a finished match
           with a controller in his hands.

           Nothing is competing for the stick once the match is over --
           the pointer lock has just been dropped two lines above -- so
           it simply comes up, and the badge that comes with it says so.
           A player who would rather not have it can dismiss it with
           the same chord. */
        try { if (pad.raw() && pointer && !pointer.on) pointer.set(true); } catch (e) { /* no pad */ }

        var again = root.querySelector('.over .again');
        var lobby = root.querySelector('.over .lobby');
        if (again) {
          again.addEventListener('click', function () {
            if (opts.onAgain) opts.onAgain(M);
            else W.location.reload();
          });
        }
        if (lobby) {
          lobby.addEventListener('click', function () {
            if (opts.onQuit) opts.onQuit(M);
            else W.location.href = 'bunker-nine.html';
          });
        }
      }
      input.endFrame();
    }

    game.onUpdate(function (dt) { frame(dt); });
    /* THE POINTER RUNS EVEN WHEN NOTHING ELSE DOES.
     *
       frame() returns immediately once `over` is set, and the engine's
       own clock is at timeScale zero by then, so anything driven from
       the update hook is dead exactly when the player needs to press
       Play Again. This is its own loop on the browser's clock,
       answering to nothing the match owns. */
    (function pointerLoop(last) {
      var now = (W.performance ? W.performance.now() : Date.now());
      var dt = last ? Math.min(0.1, (now - last) / 1000) : 1 / 60;
      try { pointer.poll(dt, pad.raw()); } catch (e) { /* no pad */ }
      W.requestAnimationFrame(function () { pointerLoop(now); });
    })(0);
    game.start();
    /* Same as zombies: load at 256, reach the tier's target in the
       background while the pregame lobby counts down. See
       98c-texres.js and Material._buildMaps. */
    {
      var _tt = game.renderer && game.renderer.texTarget;
      if (_tt > 256 && game.upgradeTextures) game.upgradeTextures(_tt, { gapMs: 420 });
    }

    var api = {
      game: game, match: M, hud: hud, input: input, pad: pad, viewmodel: vm,
      replay: replay, pointer: pointer,
      get yaw() { return yaw; }, get pitch() { return pitch; },
      /* The rail and whatever it has called in, for a test and for the
         pause menu later. */
      rail: rail, get berserker() { return berserk; },
      callStreak: function (i) {
        if (!rail) return false;
        rail._open(true);
        while (rail.selected !== i) rail._move(1);
        return rail._call();
      },
      look: function (x, y) { yaw = x; pitch = y; },
      stop: function () { over = true; input.dispose(); game.stop(); },
    };
    W.MP_GAME_LIVE = api;
    return api;
  }

  /* Exposed so a sweep over all sixty weapons can tell an intentional
     alias from a silent fallback. Three of them are hand-built models
     under a different name, and one -- the MG42 -- genuinely has no
     model of its own and borrows the MG34's. A test that cannot tell
     those apart reports four failures and means one. */
  W.MP_GAME = { start: start, KEYS: KEYS, VM_BESPOKE: VM_BESPOKE, VM_FALLBACK: VM_FALLBACK };
})();
