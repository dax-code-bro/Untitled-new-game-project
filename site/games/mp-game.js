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
    reload: ['r'], swap: ['q', '1', '2'], scores: ['tab'],
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
     THE GUN IN YOUR HANDS
     ================================================================
     A blocked-out weapon held in view space: eight boxes placed
     relative to the camera every frame rather than parented to it,
     because the engine's camera is a position and a target rather than
     a transform you can hang things off.

     It is deliberately plain. The real models -- sixty of them, built
     as families so a receiver is shared and the barrel, magazine and
     furniture differ -- are the next piece of work, and putting a
     placeholder here that pretends otherwise would make it harder to
     tell when the real one arrives. What this does have to get right is
     WHERE it sits: the sights come up to the middle of the screen when
     you aim, and it drops to a low ready when you sprint, because those
     two are about the feel of holding it rather than about the model.
     ================================================================ */

  function makeViewmodel(game) {
    var mats = {
      body: game.material({ color: 0xb4a894, texture: 'metal', roughness: 0.58, metalness: 0.45 }),
      wood: game.material({ color: 0xc0a684, texture: 'wood', roughness: 0.90, uvScale: 2 }),
      dark: game.material({ color: 0x9aa0a8, texture: 'metal', roughness: 0.50, metalness: 0.85 }),
      hand: game.material({ color: 0xcaa992, texture: 'skin', roughness: 0.80 }),
    };
    /* [x, y, z, sx, sy, sz, material] in the camera's own frame: x
       right, y up, z forward, and sizes are the whole box rather than
       half of it.
     *
       The first attempt put the receiver nine centimetres wide at
       forty-two centimetres from the eye and left it on the centre
       line. At that range it subtended a fifth of the screen and the
       gun was a dark slab across the middle of the picture with the map
       behind it. A held rifle sits low and to the RIGHT and most of its
       length is further away than that -- the muzzle of this one is a
       metre and ten out, which is about where a real one is. */
    var HIP_X = 0.135;
    var PARTS = [
      [HIP_X, -0.170, 0.62, 0.070, 0.090, 0.34, 'body'],   // receiver
      [HIP_X, -0.200, 0.36, 0.060, 0.085, 0.22, 'wood'],   // butt
      [HIP_X, -0.245, 0.55, 0.050, 0.110, 0.06, 'dark'],   // grip
      [HIP_X, -0.272, 0.66, 0.045, 0.160, 0.055, 'dark'],  // magazine
      [HIP_X, -0.165, 0.86, 0.055, 0.060, 0.22, 'wood'],   // handguard
      [HIP_X, -0.160, 1.03, 0.018, 0.018, 0.20, 'dark'],   // barrel
      [HIP_X, -0.118, 1.10, 0.008, 0.045, 0.012, 'dark'],  // front sight
      [HIP_X, -0.118, 0.50, 0.008, 0.038, 0.012, 'dark'],  // rear sight
      [HIP_X - 0.045, -0.225, 0.85, 0.055, 0.060, 0.085, 'hand'],  // front hand
      [HIP_X + 0.045, -0.250, 0.56, 0.055, 0.065, 0.085, 'hand'],  // firing hand
    ];
    /* Aiming is one translation, and these three numbers are it: slide
       the gun onto the centre line, lift it until the SIGHTS -- which
       sit at y = -0.118 -- are on zero, and pull it back a little. The
       sight then lands on the crosshair rather than near it, because
       the same number does both jobs. */
    var ADS = [-HIP_X, 0.118, -0.06];
    var parts = PARTS.map(function (d) {
      var a = game.box({ at: [0, -80, 0], size: [d[3], d[4], d[5]],
        material: mats[d[6]], physics: false });
      if (a) { a.name = 'vm'; a.noCull = true; }
      return { a: a, off: d };
    });
    var Q = new W.LE.Quat();
    /* What the last placement was handed and what it did with it.
       Reading the gun's position out of the world and trying to work
       backwards from it is guesswork -- the same offset lands at a
       different world x depending on which way you are facing -- and
       guesswork is what made a check on this fail for three different
       reasons in a row. */
    var state = { aim: 0, sprint: 0, ox: 0, oy: 0, oz: 0, placed: 0, hidden: 0 };
    return {
      parts: parts, state: state,
      hide: function () {
        state.hidden++;
        parts.forEach(function (p) { if (p.a) p.a.visible = false; });
      },
      place: function (eye, yaw, pitch, aim, sprint, kick, bob) {
        var cy = Math.cos(yaw), sy = Math.sin(yaw);
        var cp = Math.cos(pitch), sp = Math.sin(pitch);
        var fx = sy * cp, fy = -sp, fz = cy * cp;
        var rx = cy, rz = -sy;
        var ux = sy * sp, uy = cp, uz = cy * sp;
        /* Sprinting drops the muzzle and rolls the gun over: you are
           running, and a rifle held level while running is a rifle
           being carried by somebody who has never run with one. */
        var low = sprint ? 1 : 0;
        state.aim = aim; state.sprint = low; state.placed++;
        state.ox = PARTS[0][0] + aim * ADS[0] + low * 0.03;
        state.oy = PARTS[0][1] + aim * ADS[1] + bob * 0.6 - low * 0.085;
        state.oz = PARTS[0][2] + aim * ADS[2] - kick * 0.045 - low * 0.05;
        Q.setEuler(pitch + low * 0.30, yaw, low * 0.42);
        for (var i = 0; i < parts.length; i++) {
          var p = parts[i], o = p.off;
          if (!p.a) continue;
          p.a.visible = true;
          var ox = o[0] + aim * ADS[0] + low * 0.03;
          var oy = o[1] + aim * ADS[1] + bob * 0.6 - low * 0.085;
          var oz = o[2] + aim * ADS[2] - kick * 0.045 - low * 0.05;
          p.a.position.set(
            eye.x + rx * ox + ux * oy + fx * oz,
            eye.y + uy * oy + fy * oz,
            eye.z + rz * ox + uz * oy + fz * oz
          );
          p.a.rotation.copy(Q);
          p.a._still = false;
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
    };
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
        var gap = Math.max(3, Math.min(60, spread * 640));
        el.cross.querySelector('.up').style.top = (-gap - 9) + 'px';
        el.cross.querySelector('.dn').style.top = gap + 'px';
        el.cross.querySelector('.lf').style.left = (-gap - 9) + 'px';
        el.cross.querySelector('.rt').style.left = gap + 'px';

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

        el.us.textContent = M.score[p.team];
        el.them.textContent = M.score[p.team === 'a' ? 'b' : 'a'];
        el.mode.textContent = M.mode.name;
        if (M.mode.bomb) {
          el.clock.textContent = 'ROUND ' + M.round + '  '
            + clock(Math.max(0, M.mode.seconds + 4.5 - M.roundTime));
          var B = M.bomb;
          el.bomb.classList.toggle('armed', !!(B && B.planted));
          el.bomb.textContent = !B ? ''
            : B.planted ? ('the bomb is down — ' + clock(45 - (M.time - B.plantAt)))
              : (B.carrier === p.id ? 'you have the bomb'
                : (B.attackers === p.team ? 'your side is attacking' : 'defend both sites'));
        } else {
          el.clock.textContent = clock(M.mode.minutes * 60 - M.time);
          el.bomb.textContent = '';
        }

        el.hpn.textContent = Math.max(0, Math.round(p.hp));
        el.hpbar.style.width = Math.max(0, Math.min(100, p.hp)) + '%';
        el.hp.classList.toggle('low', p.hp < 35);
        el.who.textContent = p.name + '  ·  ' + (p.team === 'a' ? 'your side' : 'your side');

        el.gname.textContent = w.name;
        el.mag.textContent = p.ammo[p.held];
        el.res.textContent = p.reserve[p.held];
        el.re.textContent = p.reloadUntil > M.time ? 'reloading'
          : (p.ammo[p.held] === 0 ? 'press R' : '');

        /* dead */
        var dead = !p.alive && !M.over;
        el.dead.classList.toggle('hide', !dead);
        if (dead) {
          var last = null;
          for (var k = M.events.length - 1; k >= 0; k--) {
            if (M.events[k].kind === 'kill' && M.events[k].who === p.id) { last = M.events[k]; break; }
          }
          el.deadBy.innerHTML = last && last.by != null
            ? ('killed by <b>' + esc(nameOf(last.by)) + '</b>'
              + (last.weapon ? ' <span class="wp">with the ' + esc(last.weapon) + '</span>' : '')
              + (last.head ? ' <span class="wp">&mdash; head shot</span>' : ''))
            : 'you are out of the round';
          el.deadN.textContent = M.mode.bomb ? '—'
            : String(Math.max(0, Math.ceil(p.respawnAt - M.time)));
        }

        /* scoreboard */
        el.board.classList.toggle('hide', !showBoard || M.over);
        if (showBoard && !M.over) el.board.innerHTML = boardHtml(M);

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
      you: { name: opts.name || 'YOU', loadout: opts.loadout },
      onEvent: function (ev) { hud.onEvent(ev); },
    });

    var hud = makeHud(root, M);
    var input = makeInput(root, canvas);
    var vm = makeViewmodel(game);

    var yaw = M.you.yaw, pitch = 0;
    var sens = (opts.sensitivity || 1) * 0.0022;
    var kick = 0, bob = 0, bobT = 0, lastHp = M.you.hp, wasAlive = true;
    var over = false;

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
      }
      lastHp = p.hp;
    }

    function frame(dt) {
      if (over) return;
      var p = M.you;

      var d = input.take();
      yaw += d[0] * sens;
      pitch += d[1] * sens;
      pitch = Math.max(-1.45, Math.min(1.45, pitch));

      var cmd = {
        yaw: yaw, pitch: pitch,
        forward: (input.any(KEYS.forward) ? 1 : 0) - (input.any(KEYS.back) ? 1 : 0),
        right: (input.any(KEYS.right) ? 1 : 0) - (input.any(KEYS.left) ? 1 : 0),
        run: input.any(KEYS.sprint), jump: input.once(KEYS.jump),
        crouch: input.any(KEYS.crouch),
        reload: input.once(KEYS.reload), swap: input.once(KEYS.swap),
        fire: input.buttons.fire, aim: input.buttons.aim,
      };
      /* Coming back from the dead, look the way you were put down
         facing. Without this the camera kept whatever angle you died
         with -- respawn while looking at your own boots and you spend
         the next life looking at the floor, because the match sets the
         spawn yaw on the combatant and this file owns the view. */
      if (!wasAlive && p.alive) { yaw = p.yaw; pitch = 0; }
      wasAlive = p.alive;

      var before = p.ammo[p.held];
      M.control(cmd, dt);
      if (p.ammo[p.held] < before) kick = Math.min(1.4, kick + 0.55);
      M.update(dt);
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
        vm.place(eye, yaw, pitch, input.buttons.aim ? 1 : 0, p.sprinting, kick, bob);
        hud.paint(cone * Math.PI / 180, input.any(KEYS.scores));
      } else {
        vm.hide();
        eye = { x: p.pos.x, y: p.pos.y + 1.1, z: p.pos.z };
        game.lookAt([eye.x, eye.y + 1.4, eye.z], [p.pos.x, p.pos.y + 1.0, p.pos.z + 0.01]);
        hud.paint(0.02, input.any(KEYS.scores));
      }

      if (M.over && !over) {
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
      game: game, match: M, hud: hud, input: input, viewmodel: vm,
      get yaw() { return yaw; }, get pitch() { return pitch; },
      look: function (x, y) { yaw = x; pitch = y; },
      stop: function () { over = true; input.dispose(); game.stop(); },
    };
    W.MP_GAME_LIVE = api;
    return api;
  }

  W.MP_GAME = { start: start, KEYS: KEYS };
})();
