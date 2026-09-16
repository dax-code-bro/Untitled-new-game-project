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
     Defaults. Everything here is a name so the rebinding work can point
     at it later without unpicking the reader. */
  var KEYS = {
    forward: ['w', 'arrowup'], back: ['s', 'arrowdown'],
    left: ['a', 'arrowleft'], right: ['d', 'arrowright'],
    jump: [' '], crouch: ['control', 'c'], sprint: ['shift'],
    slide: ['z'], reload: ['r'], swap: ['q', '1', '2'], scores: ['tab'],
    quit: ['escape'],
  };

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

/* ---- the click-to-play plate ---- */
#mpui .lock { position:absolute; inset:0; display:flex; align-items:center;
  justify-content:center; background:rgba(5,6,10,.55); pointer-events:auto;
  cursor:pointer; text-align:center; }
#mpui .lock div { font-size:13px; letter-spacing:.30em; text-transform:uppercase;
  color:#c8bfa8; line-height:2.4; }
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
    <div class="skip">press <b>Space</b> to skip</div></div>
  <div class="lock"><div>Click to play<br><b>WASD</b> move &nbsp; <b>Mouse</b> look &nbsp;
    <b>Left</b> fire &nbsp; <b>Right</b> aim<br><b>Shift</b> sprint &nbsp; <b>Space</b> jump &nbsp;
    <b>Ctrl</b> crouch &nbsp; <b>R</b> reload &nbsp; <b>Q</b> swap<br>
    <b>Tab</b> scores &nbsp; <b>Esc</b> release the mouse</div></div>
`;

  /* ================================================================
     INPUT
     ================================================================
     Held keys in a set, mouse deltas accumulated between frames. The
     pointer lock is the whole of the mouse look: without it the cursor
     hits the edge of the window and the aim stops, which is the one
     thing that makes a browser shooter feel broken. */

  function makeInput(root, canvas) {
    var down = {}, mdx = 0, mdy = 0, locked = false;
    var buttons = { fire: false, aim: false };
    var pressed = {};

    function name(e) {
      var k = e.key.toLowerCase();
      if (k === 'control' || k === 'ctrl') return 'control';
      return k;
    }
    function keyDown(e) {
      var k = name(e);
      if (!down[k]) pressed[k] = true;
      down[k] = true;
      if (k === 'tab' || k === ' ' || k.indexOf('arrow') === 0) e.preventDefault();
    }
    function keyUp(e) { down[name(e)] = false; }
    function move(e) {
      if (!locked) return;
      mdx += e.movementX || 0;
      mdy += e.movementY || 0;
    }
    function mdown(e) {
      if (!locked) return;
      if (e.button === 0) buttons.fire = true;
      if (e.button === 2) buttons.aim = true;
      e.preventDefault();
    }
    function mup(e) {
      if (e.button === 0) buttons.fire = false;
      if (e.button === 2) buttons.aim = false;
    }
    function lockChange() {
      locked = document.pointerLockElement === canvas;
      root.querySelector('.lock').classList.toggle('hide', locked);
      if (!locked) { buttons.fire = false; buttons.aim = false; }
    }

    W.addEventListener('keydown', keyDown);
    W.addEventListener('keyup', keyUp);
    W.addEventListener('mousemove', move);
    W.addEventListener('mousedown', mdown);
    W.addEventListener('mouseup', mup);
    W.addEventListener('contextmenu', function (e) { if (locked) e.preventDefault(); });
    document.addEventListener('pointerlockchange', lockChange);
    root.querySelector('.lock').addEventListener('click', function () {
      if (canvas.requestPointerLock) canvas.requestPointerLock();
    });

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
      take: function () { var d = [mdx, mdy]; mdx = 0; mdy = 0; return d; },
      endFrame: function () { pressed = {}; },
      /* A test has no mouse and no pointer lock. This is how it drives
         the same code a person does, rather than a second path that is
         the only one ever exercised. */
      _press: function (k) { down[k] = true; pressed[k] = true; },
      _release: function (k) { down[k] = false; },
      _look: function (dx, dy) { mdx += dx; mdy += dy; },
      _lock: function (v) { locked = v; root.querySelector('.lock').classList.toggle('hide', v); },
      dispose: function () {
        W.removeEventListener('keydown', keyDown); W.removeEventListener('keyup', keyUp);
        W.removeEventListener('mousemove', move); W.removeEventListener('mousedown', mdown);
        W.removeEventListener('mouseup', mup);
        document.removeEventListener('pointerlockchange', lockChange);
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

  /* Three guns have hand-built models instead of table entries, so the
     table cannot be the only place this looks. Anything with no model
     at all falls back to the nearest thing that does, because a missing
     gun should be the wrong gun and not an empty hand. */
  var VM_BESPOKE = { mp5: 'mp5', m1911: 'pistol1911', model5: 'model5',
    mauser: 'mauserC96', breakwater: 'breakwater', scatter: 'scattergun',
    sawnoff: 'sawnOff' };
  var VM_FALLBACK = { mg42: 'mg34', riotshield: 'ump' };

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
    return made;
  }

  function makeViewmodel(game) {
    var cache = {};
    var cur = null, curId = null;
    var Q = new W.LE.Quat(), Q2 = new W.LE.Quat();
    var AX = [1, 0, 0], AY = [0, 1, 0], AZ = [0, 0, 1];
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
      gun: null, reload: 0 };

    function show(g, on) {
      if (!g) return;
      g.visible = on;
      if (g.partNames) {
        for (var i = 0; i < g.partNames.length; i++) {
          var a = g[g.partNames[i]];
          if (a && a !== g) { a.visible = on; a.noCull = true; }
        }
      }
      g.noCull = true;
    }

    function select(id) {
      if (id === curId) return cur;
      if (cur) show(cur, false);
      if (!cache[id]) cache[id] = buildGun(game, id);
      cur = cache[id]; curId = id;
      state.gun = id;
      if (cur) show(cur, true);
      return cur;
    }

    return {
      state: state,
      get gun() { return cur; },
      select: select,
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
        }
      },
      /* One shot: the flash comes on for forty milliseconds, which is
         about two frames and is all a real one lasts. */
      fired: function () { flashT = 0.04; },
      hide: function () {
        state.hidden++;
        if (cur) show(cur, false);
        if (flash) flash.visible = false;
      },
      place: function (eye, yaw, pitch, aim, sprint, kick, bob, id, reload, dt) {
        var g = select(id || curId || 'm4');
        state.placed++;
        state.aim = aim;
        var low = sprint ? 1 : 0;
        state.sprint = low;
        state.reload = reload || 0;

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
        var rl = reload || 0;
        var offR = 0.135 * (1 - aim) + 0.004;
        /* -0.118, not -0.145. Measured through the real projection the
           grip sat at ndc y -0.93 -- the very bottom edge of the frame
           -- so most of what the player saw of their own weapon was the
           muzzle and nothing behind it. */
        var offU = -0.118 - low * 0.085 - rl * 0.075 + bob * 0.6 + aim * 0.056;
        var dist = 0.30 + aim * 0.055 - kick * 0.03 - low * 0.03;

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
        var gy = Math.atan2(-fz / fh, fx / fh);
        var tip = (1 - aim) * (0.50 + low * 0.10) * (1 - rl * 0.85);
        var gp = Math.asin(Math.max(-1, Math.min(1, fy))) - tip;
        var roll = low * 0.42 + (1 - aim) * 0.03 + rl * 0.30;
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
      hitMark: function (kill) { hitAt = M.time; hitKill = !!kill; },
      tookFrom: function (from) { marks.push({ t: M.time, from: from }); },

      paint: function (spread, showBoard) {
        var p = you();
        var w = M.people[p.id].guns[p.held];

        /* crosshair: the gap IS the cone */
        /* Rounded to the pixel before it is compared, because a cone
           that drifts by a thousandth of a degree is a new string every
           frame and a new layout with it. */
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
            + boardHtml(M) + '<div class="go">Back to the lobby</div>';
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
      det: q('.cam .det'), prog: q('.cam .prog i') };
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
            var k = Math.max(0.35, (hd - 0.28) / len);
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
    st.textContent = CSS;
    document.head.appendChild(st);
    var root = document.createElement('div');
    root.id = 'mpui';
    root.innerHTML = MARKUP;
    document.body.appendChild(root);

    var game = W.LE.create({ canvas: canvas, gravity: -19.6,
      quality: opts.quality || undefined });

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
    /* Every gun this player can end the match holding, built now. */
    vm.warm((M.you.guns || []).map(function (w) { return w.id || w.base; }));

    var yaw = M.you.yaw, pitch = 0;
    var sens = (opts.sensitivity || 1) * 0.0022;
    var kick = 0, bob = 0, bobT = 0, lastHp = M.you.hp, wasAlive = true;
    var adsT = 0;
    var over = false;
    /* The kill cam cannot start the instant you die: the second after
       the shot has not been recorded yet, and a kill cam that stops on
       the frame of the kill is a still photograph. So the death is
       noted, and the clip is cut a beat later. */
    var camPend = null, aliveWas = true, bestTried = false;

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

    function frame(dt) {
      if (over) return;
      var p = M.you;

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
        var skip = input.once(KEYS.jump) || input.once(KEYS.quit)
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

      /* ---- best play, before the scoreboard ---- */
      if (M.over && !bestTried) {
        bestTried = true;
        var b = M.bestPlay();
        if (b && b.clip) {
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
        forward: (input.any(KEYS.forward) ? 1 : 0) - (input.any(KEYS.back) ? 1 : 0),
        right: (input.any(KEYS.right) ? 1 : 0) - (input.any(KEYS.left) ? 1 : 0),
        run: input.any(KEYS.sprint), jump: input.once(KEYS.jump),
        crouch: input.any(KEYS.crouch),
        reload: input.once(KEYS.reload), swap: input.once(KEYS.swap),
        slide: input.once(KEYS.slide), scores: input.any(KEYS.scores),
        fire: input.buttons.fire, aim: input.buttons.aim,
        lookX: 0, lookY: 0,
      };
      /* The pad adds to what the keyboard said rather than replacing
         it, so both are live at once and neither cancels the other --
         which matters more than it sounds, because a player with a pad
         in their hands still hits Escape with the other one. */
      var padOn = pad.poll(dt, cmd);
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
      M.control(cmd, dt);
      if (p.ammo[p.held] < before) { kick = Math.min(1.4, kick + 0.55); vm.fired(); }
      M.update(dt);
      var dUp = (p.kickUp || 0) - kUp0, dSide = (p.kickSide || 0) - kSide0;
      /* Only the climb is handed to the player. The settle is the gun
         coming back down under its own weight and must NOT drag the
         view with it, or every burst ends where it started and recoil
         costs nothing. */
      if (dUp > 0) { pitch -= dUp; yaw -= dSide; pad.rumble(0.22, 0.05); }
      if (p.kills > kills0) { hud.hitMark(true); pad.rumble(0.8, 0.22); }
      pitch = Math.max(-1.45, Math.min(1.45, pitch));
      watchDamage();

      kick *= Math.pow(0.02, dt);
      var moving = Math.abs(cmd.forward) + Math.abs(cmd.right) > 0.1 && p.grounded;
      bobT += dt * (p.sprinting ? 12 : 7.5) * (moving ? 1 : 0);
      bob = moving ? Math.sin(bobT) * (p.sprinting ? 0.016 : 0.009) : bob * 0.9;

      /* The camera. Dead, it stays where you fell and looks at the man
         who did it, which is the cheapest kill camera there is and is
         better than a black screen. */
      var eye;
      if (p.alive) {
        eye = { x: p.pos.x, y: p.pos.y + W.MP_MATCH.EYE - (p.crouching ? 0.42 : 0) + bob, z: p.pos.z };
        var cp = Math.cos(pitch);
        game.lookAt([eye.x, eye.y, eye.z],
          [eye.x + Math.sin(yaw) * cp, eye.y - Math.sin(pitch), eye.z + Math.cos(yaw) * cp]);
        var w = p.guns[p.held];
        var cone = (p.aiming ? w.adsSpread : w.spread) * (moving ? 1.5 : 1) * (p.sprinting ? 2.2 : 1);
        /* AIMING IS A MOVEMENT, not a switch. This passed `aim ? 1 : 0`,
           so the gun teleported between the hip and the sight with
           nothing in between -- which is what "I can't aim down sights,
           there's no animation" is. It eases now, and faster to the
           sight than back off it, the way a real one does. */
        var wantAim = (input.buttons.aim || p.aiming) ? 1 : 0;
        var rate = wantAim ? 13 : 9;
        adsT += (wantAim - adsT) * Math.min(1, dt * rate);
        /* The reload, as a visible thing: the gun drops and rolls while
           the hands work, and comes back up. There was no reload
           animation at all. */
        var rl = 0;
        if (p.reloadUntil > M.time) {
          var total = Math.max(0.2, w.reload || 2.0);
          var left = p.reloadUntil - M.time;
          var t = Math.max(0, Math.min(1, 1 - left / total));
          rl = Math.sin(Math.min(1, t) * Math.PI);
        }
        vm.place(eye, yaw, pitch, adsT, p.sprinting, kick, bob,
          w.id || w.base || 'm4', rl, dt);
        hud.paint(cone * Math.PI / 180, cmd.scores);
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
        if (document.exitPointerLock) document.exitPointerLock();
        var go = root.querySelector('.over .go');
        if (go) {
          go.addEventListener('click', function () {
            if (opts.onQuit) opts.onQuit(M);
            else W.location.href = 'bunker-nine.html';
          });
        }
      }
      input.endFrame();
    }

    game.onUpdate(function (dt) { frame(dt); });
    game.start();

    var api = {
      game: game, match: M, hud: hud, input: input, pad: pad, viewmodel: vm,
      replay: replay,
      get yaw() { return yaw; }, get pitch() { return pitch; },
      look: function (x, y) { yaw = x; pitch = y; },
      stop: function () { over = true; input.dispose(); game.stop(); },
    };
    W.MP_GAME_LIVE = api;
    return api;
  }

  W.MP_GAME = { start: start, KEYS: KEYS };
})();
