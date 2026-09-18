/* ====================================================================
   KILLSTREAKS: THE RAIL, THE ICONS, AND CALLING ONE IN
   ====================================================================

   Three slots, on the left edge of the screen, vertically centred.
   Grey while you have not earned them; yellow the moment you have.

   THE SELECTION IS A MODE, NOT A HOTKEY. Left on the d-pad puts a red
   line around the three, and only then do up and down move between
   them -- because up and down on the d-pad already do other things
   during play, and a rail that steals them is a rail that breaks the
   rest of the controller. Left again, or B, leaves. Pressing the
   selected one calls it in.

   On a keyboard the same three are on 3, 4 and 5, and left/right
   arrows walk the rail when it is open, because a rail you can only
   reach with a controller is half a feature.

   THE ICONS ARE DRAWN, NOT LETTERED. A killstreak rail with "AS" and
   "MS" on it is a spreadsheet. Every one of the seventeen is a picture
   of the thing itself at 44 pixels: the mortar has a baseplate and a
   bipod, the gunship has its guns out of the left side, the Berserker
   has a minigun for one arm and a flame nozzle for the other. They are
   line drawings so that grey-to-yellow is one CSS variable and not
   seventeen pairs of images.
   ==================================================================== */
(function () {
  'use strict';
  var W = window;

  /* Every icon is drawn inside 0..44 on both axes with `currentColor`
     for the strokes, so the unlock state is one colour change. */
  function svg(body) {
    return '<svg viewBox="0 0 44 44" width="38" height="38" fill="none"'
      + ' stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"'
      + ' stroke-linecap="round">' + body + '</svg>';
  }

  var ICONS = {
    /* Quadcopter, three-quarter: four rotor rings on booms, a body, and
       the camera ball slung under it. */
    'k-recon': svg(
      '<circle cx="10" cy="12" r="6"/><circle cx="34" cy="12" r="6"/>'
      + '<circle cx="10" cy="30" r="6"/><circle cx="34" cy="30" r="6"/>'
      + '<path d="M14 16 L19 19 M30 16 L25 19 M14 26 L19 23 M30 26 L25 23"/>'
      + '<rect x="18" y="18" width="8" height="6" rx="1.5" fill="currentColor"'
      + ' fill-opacity=".18"/><circle cx="22" cy="27.5" r="2.6"/>'
      + '<path d="M22 8.5 v-3"/>'),

    /* The same airframe with an antenna and a broken wave. */
    'k-jammer': svg(
      '<circle cx="11" cy="14" r="5"/><circle cx="33" cy="14" r="5"/>'
      + '<rect x="17" y="19" width="10" height="7" rx="1.5"/>'
      + '<path d="M15 17.5 L19 20.5 M29 17.5 L25 20.5"/>'
      + '<path d="M22 19 v-5"/><path d="M18.5 10 a5 5 0 0 1 7 0"/>'
      + '<path d="M15.5 6.5 a10 10 0 0 1 13 0"/>'
      + '<path d="M12 31 L32 41 M32 31 L12 41"/>'),

    /* A crate under a canopy, with its strapping and a stencil. */
    'k-crate': svg(
      '<path d="M8 13 a14 9 0 0 1 28 0"/>'
      + '<path d="M8 13 L18 24 M36 13 L26 24 M22 13.6 L22 24"/>'
      + '<rect x="13" y="24" width="18" height="14" rx="1"'
      + ' fill="currentColor" fill-opacity=".14"/>'
      + '<path d="M13 29 h18 M19 24 v14 M25 24 v14"/>'),

    /* Mortar: tube on a bipod, baseplate, a round going in. */
    'k-mortar': svg(
      '<path d="M15 37 L28 12"/><path d="M12.5 36 L25.5 11"/>'
      + '<path d="M25.5 11 L28 12"/>'
      + '<path d="M17 28 L30 33 M17 28 L7 34"/>'
      + '<path d="M8 38 h16"/>'
      + '<path d="M31 8 l3 -5 l3 5 l-3 4 z" fill="currentColor" fill-opacity=".2"/>'),

    /* Tripod sentry: receiver, barrel, ammo can, three legs. */
    'k-sentry': svg(
      '<rect x="12" y="13" width="13" height="8" rx="1.5"'
      + ' fill="currentColor" fill-opacity=".14"/>'
      + '<path d="M25 16.5 h13"/><path d="M33 15 v3 M36 15 v3"/>'
      + '<rect x="7" y="16" width="5" height="6" rx="1"/>'
      + '<path d="M18 21 L11 38 M18 21 L25 38 M18 21 L18 34"/>'
      + '<path d="M8 38 h7 M22 38 h7"/><circle cx="18" cy="11" r="2"/>'),

    /* One canister opening into bomblets. */
    'k-cluster': svg(
      '<path d="M22 4 a4 4 0 0 1 4 4 v8 h-8 v-8 a4 4 0 0 1 4 -4z"'
      + ' fill="currentColor" fill-opacity=".18"/>'
      + '<path d="M18 16 L11 24 M26 16 L33 24 M22 16 v8"/>'
      + '<circle cx="9" cy="28" r="2.6"/><circle cx="17" cy="33" r="2.6"/>'
      + '<circle cx="27" cy="33" r="2.6"/><circle cx="35" cy="28" r="2.6"/>'
      + '<circle cx="22" cy="27" r="2.6"/>'),

    /* Two aircraft in echelon over the line you drew. */
    'k-airstrike': svg(
      '<path d="M8 12 L20 15 L26 12 L20 17 L20 22 L17 20 L14 22 L14 17 z"'
      + ' fill="currentColor" fill-opacity=".16"/>'
      + '<path d="M22 22 L34 25 L40 22 L34 27 L34 32 L31 30 L28 32 L28 27 z"'
      + ' fill="currentColor" fill-opacity=".16"/>'
      + '<path d="M5 38 h34" stroke-dasharray="4 3"/>'
      + '<path d="M35 36 l4 2 l-4 2"/>'),

    /* Helicopter in profile, rotor turning, skids down. */
    'k-heli': svg(
      '<path d="M6 7 h32"/><path d="M22 7 v5"/>'
      + '<path d="M13 16 a9 5.5 0 0 1 14 -2 l10 3 v4 a4 4 0 0 1 -4 4 h-20'
      + ' a6 6 0 0 1 -6 -5 z" fill="currentColor" fill-opacity=".14"/>'
      + '<path d="M35 20 h6 M38 17 v6"/>'
      + '<path d="M12 25 v6 M28 25 v6 M7 33 h26"/>'
      + '<circle cx="19" cy="18" r="2.4"/>'),

    /* A plate carrier: shoulders, cummerbund, the plate itself. */
    'k-vest': svg(
      '<path d="M14 7 l-6 4 v9 M30 7 l6 4 v9"/>'
      + '<path d="M14 7 h16 v6 a8 8 0 0 1 -8 4 a8 8 0 0 1 -8 -4 z"/>'
      + '<path d="M11 18 h22 v14 a11 11 0 0 1 -11 6 a11 11 0 0 1 -11 -6 z"'
      + ' fill="currentColor" fill-opacity=".14"/>'
      + '<path d="M11 24 h22 M16 18 v18 M28 18 v18"/>'),

    /* A jet and the wall of fire it left. */
    'k-napalm': svg(
      '<path d="M6 9 L18 12 L24 9 L18 14 L18 19 L15 17 L12 19 L12 14 z"'
      + ' fill="currentColor" fill-opacity=".16"/>'
      + '<path d="M6 38 c2 -8 5 -4 6 -10 c3 6 2 6 4 10"/>'
      + '<path d="M16 38 c2 -9 5 -5 6 -11 c3 7 2 7 4 11"/>'
      + '<path d="M26 38 c2 -8 5 -4 6 -10 c3 6 2 6 4 10"/>'
      + '<path d="M4 39 h36"/>'),

    /* A wheeled gun platform, driven. */
    'k-wheeled': svg(
      '<rect x="9" y="19" width="22" height="9" rx="2"'
      + ' fill="currentColor" fill-opacity=".14"/>'
      + '<rect x="17" y="12" width="9" height="7" rx="1.5"/>'
      + '<path d="M26 15 h12"/><path d="M34 13.5 v3"/>'
      + '<circle cx="14" cy="32" r="4.5"/><circle cx="27" cy="32" r="4.5"/>'
      + '<path d="M9 23 h-3 M31 23 h3"/>'),

    /* A gunship: long fuselage, guns out of the left side, orbiting. */
    'k-gunship': svg(
      '<path d="M5 20 h28 a7 5 0 0 1 6 4 a7 5 0 0 1 -6 4 h-28 a4 4 0 0 1 0 -8z"'
      + ' fill="currentColor" fill-opacity=".14"/>'
      + '<path d="M16 20 l-4 -9 h5 l6 9 M22 28 l4 8 h-5 l-5 -8"/>'
      + '<path d="M12 28 v5 M17 28 v6 M23 28 v4"/>'
      + '<path d="M5 24 h-2 M39 22 l4 -2"/>'
      + '<path d="M8 38 a20 6 0 0 0 28 0" stroke-dasharray="3 3"/>'),

    /* Five aircraft down one line. */
    'k-strafe': svg(
      '<path d="M4 33 L40 9" stroke-dasharray="3 3"/>'
      + '<g fill="currentColor" fill-opacity=".18">'
      + '<path d="M6 26 l6 1.5 l3 -1.5 l-3 2.5 v2.5 l-1.5 -1 l-1.5 1 v-2.5 z"/>'
      + '<path d="M14 21 l6 1.5 l3 -1.5 l-3 2.5 v2.5 l-1.5 -1 l-1.5 1 v-2.5 z"/>'
      + '<path d="M22 16 l6 1.5 l3 -1.5 l-3 2.5 v2.5 l-1.5 -1 l-1.5 1 v-2.5 z"/>'
      + '<path d="M30 11 l6 1.5 l3 -1.5 l-3 2.5 v2.5 l-1.5 -1 l-1.5 1 v-2.5 z"/>'
      + '</g>'),

    /* Three canopies, three crates. */
    'k-airdrop': svg(
      '<path d="M4 12 a8 6 0 0 1 16 0"/><path d="M4 12 L11 19 M20 12 L13 19"/>'
      + '<rect x="8" y="19" width="8" height="7" rx="1"/>'
      + '<path d="M24 12 a8 6 0 0 1 16 0"/><path d="M24 12 L31 19 M40 12 L33 19"/>'
      + '<rect x="28" y="19" width="8" height="7" rx="1"/>'
      + '<path d="M14 27 a8 6 0 0 1 16 0"/><path d="M14 27 L21 33 M30 27 L23 33"/>'
      + '<rect x="18" y="33" width="8" height="7" rx="1"'
      + ' fill="currentColor" fill-opacity=".16"/>'),

    /* The juggernaut: dome helmet, visor slit, minigun barrels. */
    'k-jugg': svg(
      '<path d="M9 22 a11 12 0 0 1 22 0 v7 h-22 z"'
      + ' fill="currentColor" fill-opacity=".14"/>'
      + '<path d="M12 19 h16" stroke-width="2.6"/>'
      + '<path d="M9 29 l-3 9 h28 l-3 -9"/>'
      + '<circle cx="36" cy="14" r="4"/>'
      + '<path d="M36 10 v-5 M32.5 12 l-4 -3 M39.5 12 l4 -3"/>'),

    /* Blackout: the power symbol, over a dead screen. */
    'k-blackout': svg(
      '<circle cx="22" cy="22" r="14"/>'
      + '<path d="M22 9 v12" stroke-width="2.6"/>'
      + '<path d="M13.5 15 a12 12 0 1 0 17 0"/>'
      + '<path d="M6 6 L38 38" stroke-width="2.2"/>'),

    /* THE BERSERKER SUIT. Slab torso with a pilot canopy, a minigun for
       the right arm (barrel cluster, muzzle ring) and a flame nozzle
       for the left, on two piston legs. */
    'k-berserker': svg(
      '<path d="M14 9 h16 l3 5 v13 l-3 4 h-16 l-3 -4 v-13 z"'
      + ' fill="currentColor" fill-opacity=".16"/>'
      + '<path d="M17 13 h10 v6 h-10 z"/>'
      + '<path d="M19 22 h6"/>'
      + '<path d="M33 16 h8 M33 19 h8 M33 22 h8"/>'
      + '<circle cx="41" cy="19" r="2.6"/>'
      + '<path d="M11 17 h-5 v6 h5"/><path d="M6 20 l-4 0"/>'
      + '<path d="M2 17.5 a3 3 0 0 0 0 5"/>'
      + '<path d="M16 31 v4 l-3 6 M28 31 v4 l3 6"/>'
      + '<path d="M9 41 h7 M28 41 h7"/>'),
  };

  function iconFor(id) {
    return ICONS[id] || svg('<rect x="9" y="9" width="26" height="26" rx="3"/>');
  }

  /* ---- the rail ---- */

  var CSS = `
#mpui .rail { position:absolute; left:0; top:50%; transform:translateY(-50%);
  display:flex; flex-direction:column; gap:8px; padding:8px 8px 8px 0;
  border:1px solid transparent; border-left:0; z-index:44; pointer-events:none; }
#mpui .rail.open { border-color:#e2413a; box-shadow:0 0 0 1px rgba(226,65,58,.35),
  0 0 18px rgba(226,65,58,.18) inset; background:rgba(8,6,6,.42); }
#mpui .rail .ks { position:relative; width:58px; height:58px; display:flex;
  align-items:center; justify-content:center; color:#5d5849;
  border:1px solid #2e2a22; background:rgba(6,7,11,.55);
  transition:color .18s linear, border-color .18s linear; }
#mpui .rail .ks.on { color:#ffd27a; border-color:#6a5a2e; }
#mpui .rail .ks.sel { border-color:#e2413a; }
#mpui .rail .ks .n { position:absolute; right:4px; bottom:2px; font-size:10px;
  letter-spacing:.06em; color:#8d8571; }
#mpui .rail .ks.on .n { color:#ffd27a; }
#mpui .rail .ks .lv { position:absolute; left:4px; top:2px; font-size:9px;
  letter-spacing:.08em; color:#6f6858; }
#mpui .rail .ks.on .lv { color:#c8a24e; }
#mpui .rail .ks i { position:absolute; left:0; right:0; bottom:0; height:2px;
  background:#ffd27a; transform-origin:left; }
#mpui .rail .lab { position:absolute; left:74px; top:50%; max-width:330px;
  white-space:normal; transform:translateY(-50%);
  white-space:nowrap; font-size:10px; letter-spacing:.24em; text-transform:uppercase;
  color:#c8bfa8; background:rgba(5,6,10,.82); border:1px solid #2c2820;
  padding:6px 10px; opacity:0; transition:opacity .14s linear; }
#mpui .rail.open .ks.sel .lab { opacity:1; }
#mpui .rail .lab b { display:block; color:#ffd27a; font-weight:normal;
  letter-spacing:.20em; }
#mpui .rail .lab s { display:block; text-decoration:none; color:#8d8571;
  letter-spacing:.14em; text-transform:none; font-size:10px; margin-top:3px; }
#mpui.cam .rail { display:none; }
`;

  /* The d-pad, by the standard mapping. */
  var DPAD = { up: 12, down: 13, left: 14, right: 15 };
  var BTN_A = 0, BTN_B = 1;

  /* ------------------------------------------------------------------
     make(root, M, opts)
       root  the #mpui element
       M     the match
       opts  { pad, input, callIn(def, level), uses(id) }
     Returns { poll(dt), open, dispose }.
     ------------------------------------------------------------------ */
  function make(root, M, opts) {
    opts = opts || {};
    var D = W.MP_DATA;
    var slots = ((M.you && M.you.loadout && M.you.loadout.streaks) || []).slice(0, 3);
    if (!slots.length) slots = ['k-recon', 'k-airstrike', 'k-berserker'];

    var defs = slots.map(function (id) { return D.streak(id); })
      .filter(function (d) { return !!d; });

    var el = document.createElement('div');
    el.className = 'rail';
    el.innerHTML = defs.map(function (d, i) {
      var lv = D.streakLevelOf(d.id, opts.uses ? opts.uses(d.id) : 0);
      var sp = D.streakLevels(d.id)[lv - 1];
      return '<div class="ks" data-i="' + i + '">' + iconFor(d.id)
        + '<b class="n">' + d.cost + '</b>'
        + '<b class="lv">L' + lv + '</b><i></i>'
        + '<div class="lab"><b>' + d.name + '</b>' + d.cost + ' kills'
        + (sp ? '<s>' + sp.name + ' — ' + sp.desc + '</s>' : '')
        + '</div></div>';
    }).join('');
    root.appendChild(el);

    var cells = [].slice.call(el.querySelectorAll('.ks'));
    var open = false, sel = 0, prev = {}, held = {};
    var lastReady = [];

    function edge(name, on) { var was = !!prev[name]; prev[name] = on; return on && !was; }

    function ready(i) {
      var d = defs[i];
      if (!d) return false;
      if (spent[i]) return false;
      return (M.you.streak || 0) >= d.cost;
    }
    var spent = [false, false, false];

    /* A new life is a new streak: what you had earned and not used is
       gone, which is the whole reason a streak is worth anything. */
    var aliveWas = true;
    function life() {
      if (aliveWas && !M.you.alive) spent = [false, false, false];
      aliveWas = M.you.alive;
    }

    function paint() {
      el.classList.toggle('open', open);
      for (var i = 0; i < cells.length; i++) {
        var r = ready(i);
        cells[i].classList.toggle('on', r);
        cells[i].classList.toggle('sel', open && i === sel);
        if (lastReady[i] !== r) {
          lastReady[i] = r;
          var bar = cells[i].querySelector('i');
          if (bar) bar.style.transform = 'scaleX(' + (r ? 1 : 0) + ')';
        }
      }
    }

    function move(d) {
      if (!defs.length) return;
      sel = (sel + d + defs.length) % defs.length;
    }

    function callIn() {
      if (!ready(sel)) return false;
      var d = defs[sel];
      var lv = D.streakLevelOf(d.id, opts.uses ? opts.uses(d.id) : 0);
      spent[sel] = true;
      /* Spending a streak spends the kills that bought it, exactly as
         it does everywhere else: you do not get two eights out of one
         run of eight. */
      M.you.streak = Math.max(0, (M.you.streak || 0) - d.cost);
      open = false;
      if (opts.callIn) opts.callIn(d, lv);
      return true;
    }

    /* Keyboard: 3/4/5 fire a slot outright; the arrows walk the rail
       once it is open, which it also is on `Q`-adjacent muscle memory
       -- no, on `\`` , because every other key in this game is taken. */
    function keys(inp) {
      if (!inp) return;
      if (inp.once(['3'])) { sel = 0; callIn(); }
      if (inp.once(['4'])) { sel = 1; callIn(); }
      if (inp.once(['5'])) { sel = 2; callIn(); }
      if (inp.once(['`'])) open = !open;
      if (open) {
        if (inp.once(['arrowup'])) move(-1);
        if (inp.once(['arrowdown'])) move(1);
        if (inp.once(['enter'])) callIn();
        if (inp.once(['escape'])) open = false;
      }
    }

    function poll(dt) {
      life();
      keys(opts.input);
      var p = opts.pad && opts.pad.raw ? opts.pad.raw() : null;
      if (p) {
        var b = p.buttons || [];
        var dn = function (i) { return !!(b[i] && (b[i].pressed || b[i].value > 0.45)); };
        if (edge('l', dn(DPAD.left))) open = !open;
        if (open) {
          if (edge('u', dn(DPAD.up))) move(-1);
          if (edge('d', dn(DPAD.down))) move(1);
          if (edge('r', dn(DPAD.right))) callIn();
          if (edge('a', dn(BTN_A))) callIn();
          if (edge('b', dn(BTN_B))) open = false;
        } else { edge('u', dn(DPAD.up)); edge('d', dn(DPAD.down));
          edge('r', dn(DPAD.right)); edge('a', dn(BTN_A)); edge('b', dn(BTN_B)); }
      }
      paint();
    }

    paint();
    return {
      el: el,
      poll: poll,
      get open() { return open; },
      get selected() { return sel; },
      defs: defs,
      /* For the tests, and for a rebind screen later. */
      _open: function (v) { open = v; paint(); },
      _move: move,
      _call: callIn,
      _ready: ready,
      dispose: function () { if (el.parentNode) el.parentNode.removeChild(el); },
    };
  }

  W.MP_STREAKS = { make: make, ICONS: ICONS, iconFor: iconFor, CSS: CSS, DPAD: DPAD };
}());
