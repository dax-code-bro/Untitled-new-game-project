/* ==================================================================
   THE MATCH
   ==================================================================
   Six a side on one of the four maps, in one of the two modes, with
   bots filling whatever the lobby has not.

   WHAT THIS IS AND IS NOT

   It is the rules and the bodies: who is on which side, where they
   come back, what a bullet does when it arrives, who is winning, and
   when it stops. It owns no pixels. The HUD reads it, the bots are
   driven by it, and a headless test can run a whole ten minute match
   in a few seconds without a screen -- which is the only way to find
   out whether a map plays before anybody has to play it.

   THE BOTS ARE NOT PRETENDING TO BE PEOPLE

   They are pretending to be players, which is a different and easier
   job. A player walks towards where the fight is, stops when they can
   see somebody, shoots at them with roughly their own accuracy, takes
   cover when hurt, and reloads at the wrong moment. That is the whole
   state machine, and it is four states, because a bot with fourteen
   states is a bot that does something inexplicable once a match and
   ruins it.

   The skill levels differ in three numbers and nothing else: how well
   they aim, how long they take to notice you, and how much they
   wander. An Elite is not given more health or a better gun -- it is
   given a shorter reaction time, and that is what being good at this
   game actually is.

   NAVIGATION

   The grid sweep, the A*, and the line-of-sight smoothing are the same
   algorithm zombies uses, written again here rather than shared. That
   is a deliberate choice and not an oversight: the zombies copy is
   wired into a round loop with its own map assumptions, and pulling it
   out mid-feature to refactor a game that works is how a working game
   stops working. engine/test/navsame.test.js runs both over the same
   world and fails if they ever disagree, so the copies cannot drift
   quietly. They should be merged the next time zombies is opened.
   ================================================================== */

(function () {
  'use strict';

  var W = window;
  var HEALTH = 100;
  var EYE = 1.62;
  /* Scratch quaternions for the carried weapon, made on first use --
     this file is parsed before the engine has necessarily run. */
  var _q1 = null, _q2 = null;
  var RESPAWN = 5.0;            // seconds, team deathmatch

  /* ============ THE COMBAT ZONE ============
   *
   * Reported: "every single map just has this weird little barrier thing
   * and these weird randomly placed objects", and the fix was named in
   * the same breath -- outside the boundary, a blinking red skull and a
   * countdown from ten saying return to the combat zone, and you die if
   * you do not.
   *
   * So the walls are gone. Every map built three or four nine-metre rock
   * or brick slabs round its edge and they were solid: the awkward
   * pillars. They are scenery now (K.deco, see mp-maps.js) so the
   * horizon still reads as enclosed, and nothing stops you walking out
   * except the clock.
   *
   * Applied to BOTS TOO, for the same reason every other rule is: a
   * boundary only the player obeys is a boundary that makes the bots
   * look like they are cheating. A bot outside its zone walks back in,
   * and dies on the same ten seconds if it cannot. */
  var ZONE_GRACE = 10.0;
  /* And four seconds before you can respawn, asked for by name. It is a
     floor under RESPAWN rather than a replacement, so a mode with a
     longer respawn keeps it. */
  var RESPAWN_FLOOR = 4.0;
  var NAV_CELL = 0.55;
  var NAV_Y = 1.05;

  /* ================================================================
     NAVIGATION
     ================================================================ */

  function navBuild(game, box, y) {
    var c = NAV_CELL;
    var w = Math.ceil((box.x1 - box.x0) / c);
    var h = Math.ceil((box.z1 - box.z0) / c);
    var g = new Uint8Array(w * h);
    var solid = function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); };
    function mark(x, z) {
      var i = Math.floor((x - box.x0) / c), j = Math.floor((z - box.z0) / c);
      if (i >= 0 && i < w && j >= 0 && j < h) g[j * w + i] = 1;
    }
    /* March, do not single-cast. One ray down a row reports only the
       first thing it meets; restarting a little past each hit walks the
       whole row and finds the far side of the crate as well as the
       near side. */
    function sweep(along, atY) {
      var n = along === 'x' ? h : w;
      for (var k = 0; k < n; k++) {
        var fixed = (along === 'x' ? box.z0 : box.x0) + (k + 0.5) * c;
        var t = 0;
        var span = along === 'x' ? box.x1 - box.x0 : box.z1 - box.z0;
        for (var guard = 0; guard < 400 && t < span; guard++) {
          var ox = along === 'x' ? box.x0 + t : fixed;
          var oz = along === 'x' ? fixed : box.z0 + t;
          var dir = along === 'x' ? [1, 0, 0] : [0, 0, 1];
          var hit = game.raycast([ox, atY, oz], dir, span - t, solid);
          if (!hit) break;
          var d = Math.hypot(hit.point.x - ox, hit.point.z - oz);
          mark(hit.point.x, hit.point.z);
          t += d + c * 0.5;
        }
      }
    }
    /* AT MORE THAN ONE HEIGHT, and this is the whole of "the AI phase
       through stuff".
     *
       The sweep ran at a single y -- 1.05 m, chest height -- and marked
       a cell only where a ray at that exact height hit something. So
       the grid contained precisely the obstacles that intersect one
       horizontal plane a metre off the floor, and NOTHING else. A
       waist-high crate, a car bonnet, a low wall, a counter, a railing,
       a stack of sandbags: all of them invisible to the pathfinder,
       all of them walked straight through. The bots were not failing to
       path -- they have A*, a path cache and a search budget, and all
       of it works. They were pathing perfectly around a map that was
       missing most of its furniture.

       A man is 1.75 m tall and he is stopped by anything between his
       ankles and his eyes. Four heights, unioned: 0.30 catches kerbs
       and crates, 0.75 catches counters and bonnets, 1.20 is the old
       chest line, 1.60 catches the rails and beams that a body would
       walk into face first. Four times the rays, cast once at match
       start and never again. */
    var HEIGHTS = [0.30, 0.75, 1.20, 1.60];
    var base = y - 1.05;                 // keep the caller's floor offset
    for (var hi = 0; hi < HEIGHTS.length; hi++) {
      sweep('x', base + HEIGHTS[hi]);
      sweep('z', base + HEIGHTS[hi]);
    }
    return { box: box, w: w, h: h, c: c, g: g };
  }

  function navBlocked(nav, i, j) {
    if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return true;
    return nav.g[j * nav.w + i] === 1;
  }

  /* WHAT IS ACTUALLY REACHABLE, worked out once.
   *
     A goal inside a wall, or on the far side of one with no way round,
     makes A* explore every cell it can get to before admitting defeat.
     On Demolition -- a hundred and eighty-two cells square -- that is
     thirty-three thousand cells a go, and four hundred and twenty-nine
     failed searches in two simulated minutes came to eighteen MILLION
     cells examined. It was the difference between a match that
     simulates in one second and one that takes seventy-two.

     One flood fill at the start of the match says which cells are
     connected to the ground the players are standing on. After that a
     goal is snapped onto that set before anybody paths to it, and the
     failure case stops existing rather than being made cheaper. */
  function navFlood(nav, from) {
    var w = nav.w, h = nav.h, c = nav.c, b = nav.box;
    var reach = new Uint8Array(w * h);
    var si = Math.max(0, Math.min(w - 1, Math.floor((from.x - b.x0) / c)));
    var sj = Math.max(0, Math.min(h - 1, Math.floor((from.z - b.z0) / c)));
    if (navBlocked(nav, si, sj)) {
      /* The seed may be standing on a marked cell -- a doorway, a step.
         Walk out to the first free one. */
      var found = false;
      for (var r = 1; r < 12 && !found; r++) {
        for (var j = sj - r; j <= sj + r && !found; j++) {
          for (var i = si - r; i <= si + r && !found; i++) {
            if (!navBlocked(nav, i, j)) { si = i; sj = j; found = true; }
          }
        }
      }
      if (!found) return reach;
    }
    var q = [sj * w + si];
    reach[sj * w + si] = 1;
    for (var k = 0; k < q.length; k++) {
      var cur = q[k], ci2 = cur % w, cj2 = (cur / w) | 0;
      for (var dj = -1; dj <= 1; dj++) {
        for (var di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          var ni = ci2 + di, nj = cj2 + dj;
          if (navBlocked(nav, ni, nj)) continue;
          var kk = nj * w + ni;
          if (reach[kk]) continue;
          reach[kk] = 1; q.push(kk);
        }
      }
    }
    nav.reach = reach;
    return reach;
  }

  function navReachable(nav, x, z) {
    if (!nav.reach) return true;
    var i = Math.floor((x - nav.box.x0) / nav.c), j = Math.floor((z - nav.box.z0) / nav.c);
    if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return false;
    return nav.reach[j * nav.w + i] === 1;
  }

  /* The nearest cell anybody can actually stand in. Spirals out, so the
     answer is the closest one rather than the first one found. */
  function navSnap(nav, x, z) {
    if (navReachable(nav, x, z)) return { x: x, z: z };
    var w = nav.w, h = nav.h, c = nav.c, b = nav.box;
    var ci2 = Math.floor((x - b.x0) / c), cj2 = Math.floor((z - b.z0) / c);
    for (var r = 1; r < 26; r++) {
      var best = null, bd = 1e9;
      for (var j = cj2 - r; j <= cj2 + r; j++) {
        for (var i = ci2 - r; i <= ci2 + r; i++) {
          if (Math.max(Math.abs(i - ci2), Math.abs(j - cj2)) !== r) continue;
          if (i < 0 || j < 0 || i >= w || j >= h) continue;
          if (!nav.reach || nav.reach[j * w + i] !== 1) continue;
          var d = (i - ci2) * (i - ci2) + (j - cj2) * (j - cj2);
          if (d < bd) { bd = d; best = [i, j]; }
        }
      }
      if (best) return { x: b.x0 + (best[0] + 0.5) * c, z: b.z0 + (best[1] + 0.5) * c };
    }
    return null;
  }

  function navClear(nav, a, b) {
    var c = nav.c;
    var d = Math.hypot(b.x - a.x, b.z - a.z);
    var steps = Math.ceil(d / (c * 0.5));
    for (var k = 1; k < steps; k++) {
      var t = k / steps;
      var x = a.x + (b.x - a.x) * t, z = a.z + (b.z - a.z) * t;
      var i = Math.floor((x - nav.box.x0) / c), j = Math.floor((z - nav.box.z0) / c);
      if (navBlocked(nav, i, j)) return false;
    }
    return true;
  }

  function navPath(nav, from, to, stats) {
    var c = nav.c, b = nav.box, w = nav.w, h = nav.h;
    function ci(x) { return Math.max(0, Math.min(w - 1, Math.floor((x - b.x0) / c))); }
    function cj(z) { return Math.max(0, Math.min(h - 1, Math.floor((z - b.z0) / c))); }
    var si = ci(from.x), sj = cj(from.z);
    var ti = ci(to.x), tj = cj(to.z);
    if (si === ti && sj === tj) return [];
    /* Not connected to anything: refuse before searching, not after. */
    if (nav.reach && nav.reach[tj * w + ti] !== 1) return null;
    if (navBlocked(nav, ti, tj)) {
      var best = null, bd = 1e9;
      for (var j2 = Math.max(0, tj - 5); j2 <= Math.min(h - 1, tj + 5); j2++) {
        for (var i2 = Math.max(0, ti - 5); i2 <= Math.min(w - 1, ti + 5); i2++) {
          if (navBlocked(nav, i2, j2)) continue;
          var dd = (i2 - ti) * (i2 - ti) + (j2 - tj) * (j2 - tj);
          if (dd < bd) { bd = dd; best = [i2, j2]; }
        }
      }
      if (!best) return null;
      ti = best[0]; tj = best[1];
    }
    var n = w * h;
    var gScore = new Float32Array(n).fill(Infinity);
    var came = new Int32Array(n).fill(-1);
    var closed = new Uint8Array(n);
    var start = sj * w + si, goal = tj * w + ti;
    gScore[start] = 0;
    function hEst(k) {
      var i = k % w, j = (k / w) | 0;
      var dx = Math.abs(i - ti), dz = Math.abs(j - tj);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    }
    /* A BINARY HEAP, AND NOT A LINEAR SCAN.
     *
       The zombies version scans the open set to find the cheapest cell,
       with a comment saying the grid is under two thousand cells and a
       scan costs less than the code to avoid it. That is true of the
       bunker. It is not true here: Demolition's grid is a hundred and
       eighty-two squared, so a search that has to look at most of it
       does thirty-three thousand scans of an open set that is itself
       thousands long. One twelve-minute match on that map took SEVENTY
       TWO SECONDS to simulate, against four for the others.

       The heap is twenty lines and makes it linear-ish in the number of
       cells examined. */
    var heap = [], hf = [];
    function push(k, f) {
      heap.push(k); hf.push(f);
      var c = heap.length - 1;
      while (c > 0) {
        var par = (c - 1) >> 1;
        if (hf[par] <= hf[c]) break;
        var tk = heap[par]; heap[par] = heap[c]; heap[c] = tk;
        var tf = hf[par]; hf[par] = hf[c]; hf[c] = tf;
        c = par;
      }
    }
    function pop() {
      var top = heap[0];
      var lastK = heap.pop(), lastF = hf.pop();
      if (heap.length) {
        heap[0] = lastK; hf[0] = lastF;
        var c2 = 0;
        for (;;) {
          var l = c2 * 2 + 1, r2 = l + 1, m2 = c2;
          if (l < heap.length && hf[l] < hf[m2]) m2 = l;
          if (r2 < heap.length && hf[r2] < hf[m2]) m2 = r2;
          if (m2 === c2) break;
          var tk2 = heap[m2]; heap[m2] = heap[c2]; heap[c2] = tk2;
          var tf2 = hf[m2]; hf[m2] = hf[c2]; hf[c2] = tf2;
          c2 = m2;
        }
      }
      return top;
    }
    push(start, hEst(start));
    var found = false, guard = 0;
    while (heap.length && guard++ < 40000) {
      if (stats) stats.pathCells++;
      var cur = pop();
      if (closed[cur]) continue;
      if (cur === goal) { found = true; break; }
      closed[cur] = 1;
      var i3 = cur % w, j3 = (cur / w) | 0;
      for (var dj = -1; dj <= 1; dj++) {
        for (var di = -1; di <= 1; di++) {
          if (!di && !dj) continue;
          var ni = i3 + di, nj = j3 + dj;
          if (navBlocked(nav, ni, nj)) continue;
          if (di && dj && (navBlocked(nav, i3 + di, j3) || navBlocked(nav, i3, j3 + dj))) continue;
          var kk = nj * w + ni;
          if (closed[kk]) continue;
          var step = (di && dj) ? Math.SQRT2 : 1;
          var g2 = gScore[cur] + step;
          if (g2 < gScore[kk]) {
            gScore[kk] = g2; came[kk] = cur;
            /* Pushed again rather than decreased in place; the stale
               copy is skipped when it comes out, because by then the
               cell is closed. */
            push(kk, g2 + hEst(kk));
          }
        }
      }
    }
    if (!found) return null;
    var out = [];
    for (var k3 = goal; k3 !== -1 && k3 !== start; k3 = came[k3]) {
      out.push([b.x0 + (k3 % w + 0.5) * c, 0, b.z0 + (((k3 / w) | 0) + 0.5) * c]);
    }
    out.reverse();
    var keep = [];
    var at = { x: from.x, z: from.z };
    for (var k4 = 0; k4 < out.length; k4++) {
      var next = out[k4 + 1];
      if (next && navClear(nav, at, { x: next[0], z: next[2] })) continue;
      keep.push(out[k4]);
      at = { x: out[k4][0], z: out[k4][2] };
    }
    return keep;
  }

  /* ================================================================
     RANDOMNESS YOU CAN REPLAY
     ================================================================
     A match that cannot be run twice the same way cannot be debugged.
     Everything random goes through here. */
  function rng(seed) {
    var s = (seed >>> 0) || 1;
    return function () {
      s ^= s << 13; s >>>= 0;
      s ^= s >> 17;
      s ^= s << 5; s >>>= 0;
      return s / 4294967296;
    };
  }

  /* ================================================================
     A COMBATANT
     ================================================================
     You and the eleven bots are the same object with one flag
     different, deliberately. Every rule -- damage, falloff, reloads,
     respawn timing, the scoreboard -- then applies to all twelve
     without a single branch, and it is not possible for the player to
     be quietly advantaged by a rule the bots go through a different
     path for. */

  function makeCombatant(M, i, team, def) {
    var lo = def.loadout;
    var primary = MP_DATA.build(lo.primary, lo.primaryAtt);
    var secondary = MP_DATA.build(lo.secondary, lo.secondaryAtt);
    return {
      id: i, name: def.name, team: team, bot: !!def.bot, skill: def.skill || null,
      operator: def.operator || null,
      hp: HEALTH, alive: false, respawnAt: 0,
      /* Set only by the Search and Destroy tank -- see busyHold. */
      busy: null,
      pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0,
      sliding: false, slideEnd: 0, slideRecover: 0,
      vel: { x: 0, z: 0 },
      actor: null,
      guns: [primary, secondary], held: 0,
      ammo: [primary.mag, secondary.mag],
      reserve: [primary.mag * 10, secondary.mag * 10],
      reloadUntil: 0, nextShot: 0,
      loadout: lo,
      kills: 0, deaths: 0, assists: 0, damage: 0, streak: 0, bestStreak: 0,
      /* Everything the bot brain keeps between frames. Empty for you. */
      aiming: false,
      ai: { state: 'advance', target: null, sawAt: -99, path: null, pathAt: -99,
        pathIdx: 0, goal: null, goalAt: -99, strafe: 1, jitter: 0,
        lostAt: -99, reactAt: 0 },
    };
  }

  /* WHICH WAY IS RIGHT.
   *
     The engine is a standard right-handed system -- X right, Y up, Z out
     of the screen -- and this game points the camera along +Z, which
     means it is looking BACKWARD along the standard axis and the
     player's right hand is at -X. Rendered proof: a box at x = +3, four
     metres ahead, draws on the LEFT of the screen.

     Every yaw formula in here assumed right was +X. So looking right
     turned you left, strafing right walked you left, and the gun was
     held out over the player's left shoulder -- far enough out of frame
     that it read as "my gun doesn't come up, it's invisible". One sign,
     three symptoms that look like three bugs.

     Defined once, here, so it cannot be got wrong in a fourth place. */
  function RIGHT(yaw) { return { x: -Math.cos(yaw), z: Math.sin(yaw) }; }

  function gun(p) { return p.guns[p.held]; }

  /* Damage over distance. Full damage inside `near`, the far figure past
     `far`, and a straight ramp between the two -- which is the whole of
     why an SMG loses a street and a rifle loses a room. */
  function damageAt(w, d) {
    if (d <= w.near) return w.dmg;
    if (d >= w.far) return w.dmgFar;
    var t = (d - w.near) / (w.far - w.near);
    return w.dmg + (w.dmgFar - w.dmg) * t;
  }

  /* ================================================================
     THE MATCH
     ================================================================ */

  function start(opts) {
    var game = opts.game;
    var mapId = opts.mapId || 'town';
    var modeId = opts.mode || 'tdm';
    var mode = MP_DATA.MODES.filter(function (m) { return m.id === modeId; })[0] || MP_DATA.MODES[0];
    var teamSize = opts.teamSize || MP_DATA.TEAM_SIZE;
    var rand = rng(opts.seed || 20260915);
    var emit = opts.onEvent || function () {};
    var headless = !!opts.headless;

    var map = MP_MAPS.build(game, mapId);
    if (!map) throw new Error('no such map: ' + mapId);

    var R = mapId === 'demolition' ? 50 : (mapId === 'town' ? 62 : 58);
    var nav = navBuild(game, { x0: -R, x1: R, z0: -R, z1: R }, NAV_Y);
    /* Seeded from a spawn point, because that is by definition ground
       somebody is standing on. */
    navFlood(nav, { x: map.spawns.a[2].at[0], z: map.spawns.a[2].at[2] });

    /* ---- who is playing ---- */
    var people = [];
    var names = MP_DATA.BOT_NAMES.slice();
    var you = opts.you || {};
    people.push(makeCombatant(null, 0, 'a', {
      name: you.name || 'YOU', bot: !!opts.youBot,
      skill: opts.youBot ? MP_DATA.BOT_SKILL[2] : null,
      loadout: you.loadout || MP_DATA.defaultLoadout(),
      operator: you.operator || 'delta',
    }));
    for (var i = 1; i < teamSize * 2; i++) {
      var team = (i % 2) ? 'b' : 'a';
      var sk = MP_DATA.BOT_SKILL[(i * 3 + 1) % MP_DATA.BOT_SKILL.length];
      people.push(makeCombatant(null, i, team, {
        name: names[(i - 1) % names.length], bot: true, skill: sk,
        loadout: botLoadout(rand),
      }));
    }

    /* Counters. Cheap, always on, and the only reason the first
       simulated match was debuggable at all: it dealt four hundred
       damage and produced no kills, and no amount of reading the code
       said whether that was one long fight or forty single shots. */
    var stats = { scans: 0, acquired: 0, shots: 0, hits: 0, engageTicks: 0,
      advanceTicks: 0, breakTicks: 0, paths: 0, pathFail: 0, pathCells: 0,
      losCalls: 0, seen: 0 };

    var M = {
      stats: stats,
      game: game, map: map, mapId: mapId, mode: mode, nav: nav,
      /* The HUD draws the skull and the countdown off these rather than
         computing the zone a second time and disagreeing about it. */
      outsideBy: function (pos) { return outsideBy(M, pos); },
      ZONE_GRACE: ZONE_GRACE,
      /* Put everything that has fallen back where it was. armRound
         calls it between rounds; a test calls it to check that it
         does what it says. */
      resetCollapses: function () { resetCollapses(M); },
      people: people, time: 0, over: false, winner: null,
      score: { a: 0, b: 0 }, round: 1, roundTime: 0,
      bomb: null, events: [],
      headless: headless,
      you: people[0],
    };

    /* A team band: a cuff round each upper arm in the side's colour,
       bright enough to read across a street and small enough not to
       repaint the man wearing it. Parented to the arm bones, so it
       moves with him and needs no rig of its own. */
    function teamBand(g, actor, colour) {
      if (!actor || !actor.skeleton || !g.cylinder) return;
      var mat = { color: colour, texture: 'fabric', roughness: 0.86,
        metalness: 0, emissive: colour, emissiveStrength: 0.30 };
      ['upperArmL', 'upperArmR'].forEach(function (bone) {
        var bi = actor.skeleton.index(bone);
        if (bi < 0) return;
        /* Built with its parent and bone in the OPTIONS, not assigned
           afterwards. Setting them on the finished actor left the
           engine's own bookkeeping out of it, and `rotation` on a child
           is not a Quat you can call setFromAxisAngle on -- which threw
           during world build and took the whole match down with it.
           The boot plate said so plainly and I had not looked. */
        var band = g.cylinder({ at: [0, -60, 0], radius: 0.062, height: 0.052,
          physics: false, material: mat, name: 'teamband',
          parent: actor, parentBone: bi, offset: [0, -0.120, 0] });
        if (!band) return;
      });
    }

    /* ---- bodies ----

       Everybody in the match is an operator, not just you. Twelve
       identical figures in two colours is what the lobby has been so
       far, and the seven are the answer to that: bots are dealt round
       the roster so a six-a-side has six different silhouettes on it,
       and a silhouette is genuinely worth something in a firefight --
       telling Destroyer from SWAT across a street is telling a
       breacher from an entry man, at a glance, before either of them
       has shot at you. */
    var OPS = game.operators ? game.operators().map(function (o) { return o.id; }) : [];
    people.forEach(function (p) {
      if (headless) return;
      var c = p.team === 'a' ? 0x4c6a8a : 0x8a5a4c;
      if (!p.operator) p.operator = OPS.length ? OPS[(p.id * 3 + 1) % OPS.length] : null;
      if (p.operator && game.operator) {
        /* NO TEAM TINT ON THE MAN HIMSELF.
         *
           This passed a flat team colour as the body material, which
           overrides the operator's own fatigues -- so Destroyer's
           coyote, Biohazard's hazmat yellow and SWAT's navy all became
           one of two colours, and one of those two (0x8a5a4c) is very
           close to skin. Twelve naked men, which is what they looked
           like, and it also threw away the single most useful thing
           about having seven distinguishable operators.

           The side is shown on the KIT instead -- see teamBand below.
           You can tell a friendly by the band on his arm, which is how
           it is done in life and for the same reason. */
        p.actor = game.operator(p.operator, {
          at: [0, -50, 0], name: 'mp-' + p.id, face: 'static',
          speed: 4.6, runSpeed: 6.4,
        });
        if (p.actor) teamBand(game, p.actor, c);
      } else {
        p.actor = game.character({
          at: [0, -50, 0], name: 'mp-' + p.id,
          material: { preset: 'fabric', color: c },
          height: 1.75, radius: 0.32, speed: 4.6, runSpeed: 6.4,
        });
      }
      if (p.actor && p.actor.body) p.actor.body.userData = { actor: true, mp: p.id };
    });

    recInit(M);
    hlInit(M);
    markInit(M);
    M._pathBudget = 1; M._pathMs = 0; M._pathN = 0;
    warmArms(M);

    /* ---- the first spawn ---- */
    people.forEach(function (p) { spawn(M, p, true); });
    if (mode.bomb) armRound(M);

    M.update = function (dt) { update(M, dt, rand, emit); };
    M.scoreboard = function () { return scoreboard(M); };
    M.spawnOf = function (p) { return pickSpawn(M, p); };
    M.damage = function (from, to, amount, head) { return hurt(M, from, to, amount, head, emit); };
    M.fire = function (p) { return fire(M, p, rand, emit); };
    M.control = function (cmd, dt) { control(M, cmd, dt); };
    M._emit = emit;
    M.nav = nav;
    M.recAt = function (t, out) { return recAt(M, t, out); };
    M.recSpan = function () { return recSpan(M); };
    M.bestPlay = function () { return bestPlay(M); };
    M.tapeAt = function (tape, t, out) { return tapeAt(tape, t, out); };
    M.clip = function (t0, t1) { return clipOut(M.rec, t0, t1); };
    M.coneOf = function (q) { return coneOf(M, q || M.you); };
    /* The floor under a point, for anything outside the match that has
       to stand on the map: a thrown flare, a dropped capsule, a mech. */
    M.groundAt = function (x, z, from) { return groundAt(M, x, z, from == null ? 40 : from); };
    M.pose = function (list, dt) { pose(M, list, dt); };
    /* Called in from the rail. Most streaks are not simulated yet and
       the hook says so honestly rather than pretending; the Berserker
       Suit is handled in its own module and never reaches here. */
    M.callStreak = function (def, level) {
      M._streaks = M._streaks || [];
      M._streaks.push({ id: def.id, level: level, at: M.time, by: M.you.id });
      return true;
    };
    M.unpose = function () { unpose(M); };
    return M;
  }

  /* A bot's class. Weighted rather than uniform, because players are:
     most of a lobby is carrying a rifle or an SMG, one person has a
     sniper, and somebody always has the shotgun.
   *
     THE SNIPER AND THE SHOTGUN ARE THEIR OWN CLASSES NOW, so the one
     eleven-per-cent slice that used to be 'special' is two slices --
     and what was in that slice was five rifles, three gauges, a
     crossbow and a shield, drawn uniformly. A bot was therefore twice
     as likely to spawn with the riot shield as with any particular
     sniper rifle. Split out, the weights say what the comment always
     claimed they did: one person has a sniper, somebody has a shotgun,
     and the crossbow and the shield are the rarity they should be. */
  function botLoadout(rand) {
    var r = rand();
    var cls = r < 0.40 ? 'assault' : r < 0.68 ? 'smg' : r < 0.79 ? 'lmg'
      : r < 0.88 ? 'sniper' : r < 0.95 ? 'shotgun'
      : r < 0.97 ? 'special' : 'pistol';
    var list = MP_DATA.gunsOf(cls).filter(function (g) { return !g.shield; });
    var g = list[Math.floor(rand() * list.length) % list.length];
    var pistols = MP_DATA.gunsOf('pistol');
    var s = pistols[Math.floor(rand() * pistols.length) % pistols.length];
    var L = MP_DATA.defaultLoadout();
    L.primary = g.id; L.primaryAtt = [];
    L.secondary = s.id; L.secondaryAtt = [];
    return L;
  }

  /* ================================================================
     SPAWNING
     ================================================================
     Pick the point on your side that is furthest from the nearest
     living enemy. Not the furthest from the enemy SPAWN -- from the
     enemy, now, wherever they actually are. Spawning into the back of
     somebody is the single worst thing a shooter does to a player, and
     it is entirely avoidable with one loop. */

  function pickSpawn(M, p) {
    var list = M.map.spawns[p.team] || M.map.spawns.a;
    var foes = M.people.filter(function (q) { return q.team !== p.team && q.alive; });
    var best = list[0], bd = -1;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      var near = 1e9;
      for (var j = 0; j < foes.length; j++) {
        var d = Math.hypot(foes[j].pos.x - s.at[0], foes[j].pos.z - s.at[2]);
        if (d < near) near = d;
      }
      /* A tiny random nudge so twelve bodies do not all queue for the
         same best point when the map is empty. */
      near += (i % 3) * 0.5;
      if (near > bd) { bd = near; best = s; }
    }
    return best;
  }

  function spawn(M, p, first) {
    var s = pickSpawn(M, p);
    p.pos = { x: s.at[0], y: s.at[1], z: s.at[2] };
    p.yaw = s.yaw; p.pitch = 0;
    p.hp = HEALTH; p.alive = true; p.streak = 0;
    p.prone = false; p.crouching = false; p.sliding = false;
    p._crouchWas = false; p._crouchUsed = false; p._wantSlide = false;
    /* Far enough in the past that neither cooldown is running. */
    p.proneAt = -99; p.slideEnd = -99;
    p.held = 0;
    /* The swap, as two halves: the old gun goes down out of the frame,
       the slot changes where nothing can see it change, and the new one
       comes up. `swapUntil` is when the whole of it ends, `swapFor` how
       long it is, `swapTo` the slot it lands on. */
    p.swapUntil = 0; p.swapFor = 0; p.swapTo = -1;
    p.ammo = [p.guns[0].mag, p.guns[1].mag];
    p.reserve = [p.guns[0].mag * 10, p.guns[1].mag * 10];
    p.reloadUntil = 0; p.nextShot = 0;
    p.lastGood = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
    p.sliding = false; p.slideEnd = 0; p.slideRecover = 0;
    // And no shove survives a respawn -- the push decays inside moveBy,
    // which does not run for a dead man, so the last shot he fired
    // before he was killed would otherwise be waiting for him.
    p.vy = 0; p.kickUp = 0; p.kickSide = 0; p.kickHold = 0;
    p.push = { x: 0, z: 0 };
    /* Back on his feet, so the body he left is his own again. One
       actor per player means the corpse cannot outlive the respawn --
       the full version wants a second body to leave behind, and that
       is a pool of its own rather than a line here. */
    p.corpse = null; p.dyingAt = 0;
    p._animState = null;
    p.ai.state = 'advance'; p.ai.target = null; p.ai.path = null;
    p.ai.goal = null; p.ai.goalAt = -99;
    if (p.actor && p.actor.controller) {
      p.actor.controller.teleport([p.pos.x, p.pos.y + lift(p), p.pos.z]);
      // Facing too, or a man spawns looking the way the LAST one did.
      face(p.actor, p.yaw);
    }
    if (!first) M.events.push({ t: M.time, kind: 'spawn', who: p.id });
  }

  /* ================================================================
     SHOOTING
     ================================================================
     A ray from the eye, with a cone on it, against everybody alive on
     the other side. The cone is the gun's aimed or hip spread widened
     by how badly the shooter is aiming -- which for a bot is its skill
     and for you is whether you were moving.

     Bodies are checked as capsules rather than by raycasting the world
     for an actor, because the world raycast returns the first thing it
     meets and a bot standing behind a crate at the same screen
     position as an enemy would eat the bullet. Here the world is
     tested for cover separately, which is the question that was
     actually being asked. */

  /* THE EYE FOLLOWS THE STANCE TOO. It was a flat 1.62 whatever the
     man was doing, so a crouched bot saw over the wall it was crouched
     behind and shot from a barrel a foot above its own shoulder --
     which is most of what makes cover in this game feel arbitrary.
     Matched to the camera's own stance heights in mp-game. */
  function eyeOf(p) {
    var y = p.prone ? 0.38 : (p.crouching || p.sliding ? 1.20 : EYE);
    return { x: p.pos.x, y: p.pos.y + y, z: p.pos.z };
  }

  function losClear(M, from, to) {
    if (M.stats) M.stats.losCalls++;
    var dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    var len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    var h = M.game.raycast([from.x, from.y, from.z], [dx / len, dy / len, dz / len], len - 0.25,
      function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); });
    return !h;
  }

  /* WHERE A BODY IS, AS FAR AS A BULLET IS CONCERNED.
   *
     A vertical capsule from the shins to the shoulders with a sphere on
     top of it, tested as a ray against a segment. And the aim point --
     AIM_Y -- is on that segment, which it was not.

     That mismatch is the whole of why the first simulated match fired
     two thousand seven hundred shots and landed thirty-three. The bots
     aimed at chest height, 1.45 above the feet, and the hit test
     measured the perpendicular distance to a point at 0.90. A shot
     placed perfectly at the aim point was therefore fifty-five
     centimetres off a body whose tolerance was forty, so a bot could
     only hit by MISSING its own aim, and the better it aimed the worse
     it shot. Everybody stood in the open emptying magazines at each
     other for ten minutes and nobody fell over.

     One constant, used by the aim and by the test. */
  var BODY_LO = 0.35, BODY_HI = 1.48, BODY_R = 0.36;
  var HEAD_Y = 1.66, HEAD_R = 0.15;
  var AIM_Y = 1.25;

  /* WHERE ON A MAN YOU AIM, and it is not a constant.
   *
     AIM_Y was one number for everybody, 1.25 -- the middle of a
     standing man's chest -- and it was used for every target whatever
     he was doing. The moment bots started crouching, every round aimed
     at a crouched man went forty centimetres over his chest and mostly
     over his head, and the measured hit rate across a full match fell
     from 15.8 per cent to 13.7. That is not "crouching works", it is
     the shooter aiming at a man who is not there.

     Taken off the hitbox tables rather than typed in, so the aim point
     and the thing it is aiming at cannot drift apart: it is the middle
     of whichever chest capsule the target's stance is using. */
  function aimYOf(q) {
    if (!q) return AIM_Y;
    var list = q.prone ? HB_PRONE : (q.crouching || q.sliding ? HB_CROUCH : HB_STAND);
    for (var i = 0; i < list.length; i++) {
      if (list[i][7] === 'chest') return (list[i][1] + list[i][4]) / 2;
    }
    return AIM_Y;
  }

  /* ================================================================
     THE HITBOX IS THE MAN, NOT A BARREL AROUND HIM
     ================================================================
     It was one vertical cylinder 0.72m across from the knees to the
     collar, plus a ball for the head. Which means a round that passed
     thirty centimetres to the side of somebody's ribs -- through the
     air next to his arm -- hit him, and a round through the gap
     between his legs hit him, and a round that clipped his boot
     missed. "Skin tight, not even a bit off" is exactly the right
     complaint.

     ELEVEN CAPSULES, laid out on the same skeleton the model is built
     on. A capsule is the right primitive for a limb and the ray test
     against one is a segment-to-segment distance, which is thirty
     lines and no allocation. A sphere is a capsule of zero length, so
     the head is one too and there is one test rather than two shapes.

     The layout is in the body's OWN space -- x to his right, y up from
     his feet, z the way he is facing -- and it is turned by his yaw
     before the test. That matters: a man side-on is narrower than a
     man facing you, and with a cylinder he never was.

     THREE STANCES. Standing, crouched and flat each have their own
     set, because a crouched man is not a standing man scaled and a
     prone man is not either -- he is a metre and a half of body lying
     along the ground in the direction he is facing, which is a
     completely different silhouette from the front and from the side.

     WHAT IT IS WORTH. Each part carries its own multiplier, so a limb
     hit is worth less than a chest hit and a head is worth whatever
     the weapon says. There was no such thing as a limb hit before. */

  /* [ax, ay, az, bx, by, bz, radius, part, multiplier] */
  var HB_STAND = [
    [0, 1.60, 0.01, 0, 1.72, 0.01, 0.105, 'head', null],   // null = the weapon's hs
    [0, 1.44, 0, 0, 1.56, 0, 0.075, 'neck', 1.35],
    [0, 1.06, 0, 0, 1.44, 0, 0.185, 'chest', 1.00],
    [0, 0.90, 0, 0, 1.08, 0, 0.165, 'gut', 1.00],
    [-0.20, 1.40, 0, -0.24, 1.12, 0.02, 0.068, 'armL', 0.72],
    [0.20, 1.40, 0, 0.24, 1.12, 0.02, 0.068, 'armR', 0.72],
    [-0.24, 1.12, 0.02, -0.22, 0.90, 0.10, 0.056, 'foreL', 0.72],
    [0.24, 1.12, 0.02, 0.22, 0.90, 0.10, 0.056, 'foreR', 0.72],
    [-0.10, 0.88, 0, -0.11, 0.48, 0, 0.098, 'thighL', 0.80],
    [0.10, 0.88, 0, 0.11, 0.48, 0, 0.098, 'thighR', 0.80],
    [-0.11, 0.48, 0, -0.11, 0.08, 0.02, 0.072, 'shinL', 0.70],
    [0.11, 0.48, 0, 0.11, 0.08, 0.02, 0.072, 'shinR', 0.70],
  ];
  /* Crouched: the hips drop 0.42 and the thighs fold forward, so the
     knees are in front of the body rather than under it. */
  var HB_CROUCH = [
    [0, 1.18, 0.03, 0, 1.30, 0.03, 0.105, 'head', null],
    [0, 1.02, 0.02, 0, 1.14, 0.02, 0.075, 'neck', 1.35],
    [0, 0.66, 0.01, 0, 1.02, 0.02, 0.185, 'chest', 1.00],
    [0, 0.52, 0, 0, 0.68, 0.01, 0.165, 'gut', 1.00],
    [-0.20, 0.98, 0.02, -0.24, 0.72, 0.06, 0.068, 'armL', 0.72],
    [0.20, 0.98, 0.02, 0.24, 0.72, 0.06, 0.068, 'armR', 0.72],
    [-0.24, 0.72, 0.06, -0.22, 0.54, 0.14, 0.056, 'foreL', 0.72],
    [0.24, 0.72, 0.06, 0.22, 0.54, 0.14, 0.056, 'foreR', 0.72],
    /* THE LEGS FOLLOW THE BODY THAT IS DRAWN.
       These were authored for the crouch somebody meant to make, and
       the clip was making a different one -- with the knees pointing
       BACKWARDS and the feet 122mm underground, so neither the
       hitbox nor the model was where the other was. The clip is fixed
       now and these are measured off it: hip joint at 0.485, knee at
       0.262 and 0.356 forward, ankle at 0.087 and back under the
       hips. Skin tight means tight to what is on the screen. */
    [-0.11, 0.49, 0, -0.13, 0.26, 0.34, 0.098, 'thighL', 0.80],
    [0.11, 0.49, 0, 0.13, 0.26, 0.34, 0.098, 'thighR', 0.80],
    [-0.13, 0.26, 0.34, -0.12, 0.09, 0.00, 0.072, 'shinL', 0.70],
    [0.13, 0.26, 0.34, 0.12, 0.09, 0.00, 0.072, 'shinR', 0.70],
  ];
  /* Flat: everything is between 0.10 and 0.36 off the ground and runs
     backwards along -Z from the head, which is at the front. */
  var HB_PRONE = [
    [0, 0.30, 0.62, 0, 0.30, 0.74, 0.105, 'head', null],
    [0, 0.28, 0.50, 0, 0.29, 0.62, 0.075, 'neck', 1.35],
    [0, 0.26, 0.14, 0, 0.28, 0.50, 0.175, 'chest', 1.00],
    [0, 0.24, -0.06, 0, 0.26, 0.16, 0.155, 'gut', 1.00],
    [-0.22, 0.20, 0.34, -0.26, 0.20, 0.54, 0.068, 'armL', 0.72],
    [0.22, 0.20, 0.34, 0.26, 0.20, 0.54, 0.068, 'armR', 0.72],
    [-0.26, 0.18, 0.54, -0.20, 0.18, 0.68, 0.056, 'foreL', 0.72],
    [0.26, 0.18, 0.54, 0.20, 0.18, 0.68, 0.056, 'foreR', 0.72],
    [-0.11, 0.18, -0.06, -0.13, 0.16, -0.50, 0.092, 'thighL', 0.80],
    [0.11, 0.18, -0.06, 0.13, 0.16, -0.50, 0.092, 'thighR', 0.80],
    [-0.13, 0.14, -0.50, -0.13, 0.12, -0.90, 0.070, 'shinL', 0.70],
    [0.13, 0.14, -0.50, 0.13, 0.12, -0.90, 0.070, 'shinR', 0.70],
  ];

  function hbOf(p) {
    return p.prone ? HB_PRONE : (p.crouching || p.sliding ? HB_CROUCH : HB_STAND);
  }
  /* The tightest sphere round the whole set, per stance, so one cheap
     test throws out the ninety-odd per cent of rounds that were never
     going anywhere near anybody. Measured off the tables rather than
     typed in, because a broad-phase radius that is too small silently
     eats real hits. */
  function boundOf(list) {
    var cy = 0, r = 0, i;
    var lo = 1e9, hi = -1e9;
    for (i = 0; i < list.length; i++) {
      lo = Math.min(lo, list[i][1] - list[i][6], list[i][4] - list[i][6]);
      hi = Math.max(hi, list[i][1] + list[i][6], list[i][4] + list[i][6]);
    }
    cy = (lo + hi) / 2;
    for (i = 0; i < list.length; i++) {
      var q = list[i];
      r = Math.max(r,
        Math.hypot(q[0], q[1] - cy, q[2]) + q[6],
        Math.hypot(q[3], q[4] - cy, q[5]) + q[6]);
    }
    return { y: cy, r: r };
  }
  var HB_BOUND = { stand: boundOf(HB_STAND), crouch: boundOf(HB_CROUCH),
    prone: boundOf(HB_PRONE) };
  function boundFor(p) {
    return p.prone ? HB_BOUND.prone
      : (p.crouching || p.sliding ? HB_BOUND.crouch : HB_BOUND.stand);
  }

  /* Ray from `o` along unit `d` against the segment a..b of radius r.
     Returns the distance along the ray, or -1. Standard segment-to-ray
     closest approach with both parameters clamped, which is exact for
     the cylinder body of the capsule and a close enough approximation
     at the rounded ends that no player will ever measure it. */
  function rayCapsule(ox, oy, oz, dx, dy, dz, ax, ay, az, bx, by, bz, r) {
    var ux = bx - ax, uy = by - ay, uz = bz - az;
    var wx = ox - ax, wy = oy - ay, wz = oz - az;
    var uu = ux * ux + uy * uy + uz * uz;
    var ud = ux * dx + uy * dy + uz * dz;
    var uw = ux * wx + uy * wy + uz * wz;
    var dw = dx * wx + dy * wy + dz * wz;
    var den = uu - ud * ud;                 // d is unit, so dd = 1
    var t, sSeg;
    if (den < 1e-9) {
      /* Parallel: any point will do; take the near end. */
      t = -dw; sSeg = 0;
    } else {
      t = (ud * uw - dw * uu) / den;
      sSeg = (uu * 0 + ud * t + uw) / (uu || 1);
    }
    if (t < 0) t = 0;
    sSeg = Math.max(0, Math.min(1, sSeg));
    /* One refinement with the segment parameter pinned, which is what
       makes the clamped case right rather than nearly right. */
    var cx = ax + ux * sSeg, cy = ay + uy * sSeg, cz = az + uz * sSeg;
    t = (cx - ox) * dx + (cy - oy) * dy + (cz - oz) * dz;
    if (t < 0) return -1;
    var px = ox + dx * t - cx, py = oy + dy * t - cy, pz = oz + dz * t - cz;
    if (px * px + py * py + pz * pz > r * r) return -1;
    return t;
  }

  function rayBody(from, dir, p) {
    if (W.MP_DEBUG && W.MP_DEBUG.fatHitbox) return rayBodyOld(from, dir, p);
    /* Broad phase: one sphere round the whole man. */
    var B = boundFor(p);
    var ox = from.x, oy = from.y, oz = from.z;
    var cx = p.pos.x, cy = p.pos.y + B.y, cz = p.pos.z;
    var vx = cx - ox, vy = cy - oy, vz = cz - oz;
    var along = vx * dir.x + vy * dir.y + vz * dir.z;
    if (along <= 0.25) return null;
    var offx = vx - dir.x * along, offy = vy - dir.y * along, offz = vz - dir.z * along;
    if (offx * offx + offy * offy + offz * offz > B.r * B.r) return null;

    /* Narrow phase, in his own space. */
    var list = hbOf(p);
    var c = Math.cos(p.yaw), sn = Math.sin(p.yaw);
    var best = -1, bestPart = null, bestMul = 1;
    for (var i = 0; i < list.length; i++) {
      var q = list[i];
      /* Local (x, z) to world: forward is (sin yaw, cos yaw) and right
         is (-cos yaw, sin yaw) -- see RIGHT() -- so a local +x (his
         right) goes to (-cos, +sin) and a local +z (forward) goes to
         (+sin, +cos). */
      var ax = p.pos.x - q[0] * c + q[2] * sn;
      var az = p.pos.z + q[0] * sn + q[2] * c;
      var bx = p.pos.x - q[3] * c + q[5] * sn;
      var bz = p.pos.z + q[3] * sn + q[5] * c;
      var t = rayCapsule(ox, oy, oz, dir.x, dir.y, dir.z,
        ax, p.pos.y + q[1], az, bx, p.pos.y + q[4], bz, q[6]);
      if (t < 0) continue;
      if (best >= 0 && t >= best) continue;
      best = t; bestPart = q[7]; bestMul = q[8];
    }
    if (best < 0) return null;
    return { d: best, head: bestPart === 'head', part: bestPart, mul: bestMul };
  }

  /* The one cylinder this replaced, kept only so a bisect can put it
     back without a checkout: MP_DEBUG.fatHitbox. */
  function rayBodyOld(from, dir, p) {
    var px = p.pos.x, pz = p.pos.z;
    var ax = px - from.x, az = pz - from.z;
    var lo = p.pos.y + BODY_LO - from.y, hi = p.pos.y + BODY_HI - from.y;
    var dh = Math.hypot(dir.x, dir.z);
    if (dh < 1e-6) return null;
    var along = (ax * dir.x + az * dir.z) / (dh * dh);
    if (along <= 0.3) return null;
    var offx = ax - dir.x * along, offz = az - dir.z * along;
    var offH = Math.hypot(offx, offz);
    if (offH > BODY_R + HEAD_R) return null;
    var y = dir.y * along;
    var head = Math.abs(y - (p.pos.y + HEAD_Y - from.y)) < HEAD_R + 0.04 && offH < HEAD_R + 0.10;
    if (!head && (y < lo - BODY_R || y > hi + BODY_R)) return null;
    if (!head && offH > BODY_R) return null;
    return { d: Math.hypot(ax, az, y), head: head, part: head ? 'head' : 'chest', mul: 1 };
  }

  /* ================================================================
     TWO MEN CANNOT STAND IN THE SAME PLACE
     ================================================================
     They could, and at every spawn they did -- a photograph of the
     start of a match is five bodies inside one another with five heads
     sticking out of the top. Nothing in the match ever asked whether
     anybody else was already where a body was going: the movement
     collides with the map and with nothing alive.

     One pass at the end of the tick, each overlapping pair pushed
     apart by half the overlap each. Halves rather than moving one out
     of the other, because moving one is a rule about who was there
     first and there is no such thing -- and because two people each
     pushed half as far do not oscillate the way one pushed the whole
     way does.

     Only the living, and only in the horizontal: two men in a stairwell
     one above the other are not overlapping, and pushing them apart
     vertically would throw one off the stairs. */
  var PUSH_R = 0.34;                 // shoulder half-width, near enough
  function separate(M) {
    if (W.MP_DEBUG && W.MP_DEBUG.noSeparate) return;
    var n = M.people.length;
    for (var i = 0; i < n; i++) {
      var a = M.people[i];
      if (!a.alive) continue;
      for (var j = i + 1; j < n; j++) {
        var b = M.people[j];
        if (!b.alive) continue;
        /* Different floors are not a collision. */
        if (Math.abs(a.pos.y - b.pos.y) > 1.4) continue;
        var dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
        var d2 = dx * dx + dz * dz;
        var want = PUSH_R * 2;
        if (d2 >= want * want) continue;
        var d = Math.sqrt(d2);
        if (d < 1e-4) {
          /* Exactly on top of one another, which happens at a spawn:
             pick a direction from their ids so it is the same every
             frame and they do not jitter. */
          var ang = (i * 2.39996 + j * 0.7);
          dx = Math.cos(ang); dz = Math.sin(ang); d = 1;
        }
        var push = (want - d) * 0.5;
        var ux = dx / d, uz = dz / d;
        a.pos.x -= ux * push; a.pos.z -= uz * push;
        b.pos.x += ux * push; b.pos.z += uz * push;
      }
    }
  }

  /* WHERE THE ROUND ACTUALLY LEAVES FROM.
   *
     Out of the muzzle, not out of the eye. A gun is held below and to
     the side of your head with about sixty centimetres of barrel in
     front of it, so a shot fired from the eye is a shot fired from a
     place the gun is not -- which sounds like a detail until you lean
     round a corner, see a man, and kill him through the wall your
     barrel is still behind. That is the bug this removes, and the fact
     that the barrel being covered now blocks the shot is the point of
     it rather than a side effect. */
  var MUZZLE_FWD = 0.62, MUZZLE_DOWN = 0.14, MUZZLE_SIDE = 0.10;

  /* Twice the angle a torso subtends at the range bots fight at.
     Divided by the hit rate, it is the cone that lands that fraction
     of the rounds.

     THE HALF-WIDTH IS MEASURED, NOT ASSUMED, and it had to change when
     the hitbox did. It was 0.28 -- half of a 0.56m torso -- which was
     the right number for a hit test that was one cylinder 0.72m across
     and 1.13m tall. The eleven-capsule body is very much smaller: the
     chest capsule alone is 0.37m across and 0.75m tall, and the limbs
     around it are thin.

     Run over four full matches, the same bots at the same difficulty
     went from landing 15.9 per cent of their rounds to 12.4 -- a
     factor of 0.78 on the hit rate, and since the cone jitters yaw and
     pitch independently that is a factor of sqrt(0.78) on each axis.
     0.28 * 0.883 = 0.247, and a second pass on the same measurement
     after the aim point and the eye height were made to follow the
     stance took it to 0.227: 14.7 per cent against the 17.4 the fat
     cylinder gave, sqrt of that ratio again on each axis.

     WHAT THIS IS AND IS NOT FOR. Four of the match tests started
     failing on "it is not a walkover" when the hitbox changed, and the
     obvious reading was that tighter bodies had broken the balance.
     Measured over six seeds it is not: the losing side scored 21, 23,
     25, 29, 36 and 38 with the capsules and 16, 23, 30, 32, 38 and 46
     with the old cylinder -- overlapping distributions, and the WORST
     single match of the twelve was the old one's. The test was
     checking one sample of a seventeen-point spread against a
     threshold inside it, which is a coin flip, and it had been landing
     heads. It averages three seeds now.

     So this recalibration is not a balance patch. It is here because
     the difficulties were sold as accuracies -- twenty per cent,
     fifty, sixty, eighty-three -- and a cone solved against a body
     that is no longer that size does not deliver them.

     It is written this way round -- a measured half-width feeding the
     same formula -- rather than as a fudge factor on the cone, because
     the next time the body changes shape this is the number that has
     to move and it should be obvious that it is a measurement. */
  var BOT_TORSO_HALF = 0.227;
  var BOT_CONE_DEG = 2 * Math.atan(BOT_TORSO_HALF / 18) * 180 / Math.PI;

  /* ================================================================
     BULLET HOLES
     ================================================================
     Where a round lands, it leaves a mark. Not decoration: after a
     fight you can read the wall behind you and see that six went past
     your left shoulder and one did not, and after you die the holes
     around where you were standing are the story of how.

     A POOL, not an allocation. A fight puts hundreds of rounds into
     scenery, and building a mesh per round is an allocation per round
     and a draw call per round for the rest of the match. Sixty-four
     marks, reused oldest-first, is a fixed cost that never grows.

     Laid flat on whatever they hit, using the surface normal the
     raycast already returns, and lifted a couple of millimetres off it
     so they do not fight the wall for the same depth. */
  var MARK_MAX = 64;

  function markInit(M) {
    M._marks = { ring: [], at: 0 };
    /* AND THE PROPER ONE. mp-decals owns holes, spall, blood, pools
       and scorch, each with its own lifetime -- a minute for an
       impact, three for blood, exactly as asked. The ring above is
       kept only as the fallback for a build where that file is not
       loaded, so a page with one script missing still marks its
       walls. */
    M.decals = W.MP_DECALS ? W.MP_DECALS.make(M.game) : null;
  }

  function markAt(M, point, normal) {
    var K = M._marks;
    if (!K || !M.game || !M.game.box) return;
    var n = normal && Number.isFinite(normal.x)
      ? normal : { x: 0, y: 1, z: 0 };
    var a = K.ring[K.at];
    if (!a) {
      try {
        a = M.game.box({ at: [0, -90, 0], size: [0.062, 0.062, 0.006], physics: false,
          material: { color: 0x14100c, texture: 'smooth', roughness: 0.95, metalness: 0 } });
      } catch (e) { a = null; }
      if (!a) return;
      a.noCull = true;
      K.ring[K.at] = a;
    }
    K.at = (K.at + 1) % MARK_MAX;
    a.visible = true;
    a.position.set(point.x + n.x * 0.004, point.y + n.y * 0.004, point.z + n.z * 0.004);
    /* Turned to lie ON the surface: the mark's own +Z is its face, so
       the rotation is the one that takes +Z onto the normal. */
    if (a.rotation && a.rotation.setAxisAngle) {
      var dot = Math.max(-1, Math.min(1, n.z));
      var ax = -n.y, ay = n.x, az = 0;
      var al = Math.hypot(ax, ay, az);
      if (al < 1e-6) { ax = 1; ay = 0; az = 0; al = 1; }
      a.rotation.setAxisAngle({ x: ax / al, y: ay / al, z: az / al }, Math.acos(dot));
    }
    a._still = false;
  }

  /* ONE CONE, for the shot and for the crosshair both.
   *
     The HUD widened the crosshair by 1.5 for moving and 2.2 for
     sprinting; fire() applied neither. So the four ticks on the screen
     spread out when you ran and the rounds kept going exactly where
     they had been going -- the drawn cone and the real cone were
     different numbers, and the crosshair was telling the player
     something that was not true about their own weapon.

     Returned in degrees, which is what the weapon table is in. */
  function coneOf(M, p) {
    var w = gun(p);
    if (!w) return 1;
    var aiming = p.aiming || (p.bot && p.ai && p.ai.state === 'engage');
    var c = aiming ? w.adsSpread : w.spread;
    if ((p._animSpeed || 0) > 0.35) c *= 1.5;
    if (p.sprinting) c *= 2.2;
    if (p.crouching) c *= 0.75;
    /* Flat, with the weapon on the ground, is the steadiest a man
       gets. */
    if (p.prone) c *= 0.48;
    /* A BOT'S SPREAD COMES FROM ITS HIT RATE, not the other way round.
     *
       This used to be `c *= 1.9 - aim`, which is a shrug: it makes a
       bot worse by some amount and nobody can say what fraction of its
       rounds land. The difficulties were asked for as accuracies --
       twenty per cent, fifty, sixty, eighty-three -- so the cone is
       solved for them.

       The shot jitters yaw and pitch each by plus or minus half the
       cone, so the chance of landing on a target subtending 2t of
       angle is about 2t/cone per axis. A torso is 0.56m across, and
       bots engage at about eighteen metres on these maps, which puts
       t at 0.0156 rad. Solve 2t/cone = hit and the cone falls out.

       A bot can never be more accurate than its weapon: the gun's own
       cone is the floor. A Veteran with a shotgun is still holding a
       shotgun. */
    if (p.bot && p.skill) {
      var hit = p.skill.hit != null ? p.skill.hit : 0.5;
      var want = BOT_CONE_DEG / Math.max(0.05, hit);
      c = Math.max(c, want);
    }
    return c;
  }

  /* WHERE THE CROSSHAIR IS POINTING, in the world.
   *
     A round leaves the muzzle, and the muzzle is not the eye -- it is
     ten centimetres forward, right and down of it. Fired along the
     camera's own angle it travels PARALLEL to where you are looking
     and a hand's width to the side of it, which at across-the-room
     range is a clean miss of whatever the crosshair is sitting on.

     So: find the point the crosshair is actually over, by tracing the
     camera ray, and aim the round from the muzzle AT THAT POINT. The
     round still leaves the barrel -- which is what was asked for -- and
     it still goes where the crosshair says. Converging on the first
     thing in the way rather than on a fixed distance means it is right
     at every range instead of at one. */
  function aimPointOf(M, p, eye, reach) {
    var cp = Math.cos(p.pitch);
    var d = { x: Math.sin(p.yaw) * cp, y: -Math.sin(p.pitch), z: Math.cos(p.yaw) * cp };
    var far = Math.max(12, reach || 90);
    var hit = null;
    try {
      hit = M.game && M.game.raycast
        ? M.game.raycast([eye.x, eye.y, eye.z], [d.x, d.y, d.z], far, notActor)
        : null;
    } catch (e) { hit = null; }
    if (hit && hit.point) return { x: hit.point.x, y: hit.point.y, z: hit.point.z };
    return { x: eye.x + d.x * far, y: eye.y + d.y * far, z: eye.z + d.z * far };
  }

  function muzzleOf(p) {
    var e = eyeOf(p);
    var cp = Math.cos(p.pitch), sp = Math.sin(p.pitch);
    var sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    var f = { x: sy * cp, y: -sp, z: cy * cp };
    /* Aiming brings the gun onto the centre line, which is the whole
       point of aiming, so the offset goes away as the sights come up. */
    var side = p.aiming ? 0 : MUZZLE_SIDE, down = p.aiming ? 0.02 : MUZZLE_DOWN;
    return {
      x: e.x + f.x * MUZZLE_FWD - cy * side,
      y: e.y + f.y * MUZZLE_FWD - down,
      z: e.z + f.z * MUZZLE_FWD + sy * side,
    };
  }

  function fire(M, p, rand, emit) {
    /* Both hands are on a pair of wire cutters. Guarded here and not at
       the callers because M.fire and fireHuman are public entry points
       that do not pass through either of them, and a hold with a way
       round it is the fault this was written to fix. */
    if (p.busy) return false;
    var w = gun(p);
    if (!p.alive || M.time < p.nextShot || M.time < p.reloadUntil) return null;
    if (p.ammo[p.held] <= 0) { beginReload(M, p); return null; }
    p.ammo[p.held]--;
    p.nextShot = M.time + 60 / w.rpm;
    // Stamped so the recorder can flag this tick as a shot -- a replay
    // with no muzzle flashes is a replay of people jogging.
    p.lastShotAt = M.time;
    if (M.stats) M.stats.shots++;
    kickFrom(M, p, w, rand);

    /* If the muzzle itself is inside something, the round goes into
       that and no further. */
    var eye = eyeOf(p);
    var from = muzzleOf(p);
    if (!losClear(M, eye, from)) from = eye;
    /* Aimed or from the hip. A bot is aiming whenever it is engaging;
       you are aiming when you are holding the button. */
    var cone = coneOf(M, p) * Math.PI / 180;
    /* Aimed at what the crosshair is over, from where the barrel is. */
    var at = aimPointOf(M, p, eye, w.far * 2.2);
    var ax = at.x - from.x, ay = at.y - from.y, az = at.z - from.z;
    var alen = Math.hypot(ax, ay, az) || 1;
    var baseYaw = Math.atan2(ax / alen, az / alen);
    var basePitch = -Math.asin(Math.max(-1, Math.min(1, ay / alen)));
    var out = [];
    for (var s = 0; s < (w.pellets || 1); s++) {
      var yaw = baseYaw + (rand() - 0.5) * cone;
      var pitch = basePitch + (rand() - 0.5) * cone;
      var dir = { x: Math.sin(yaw) * Math.cos(pitch), y: -Math.sin(pitch), z: Math.cos(yaw) * Math.cos(pitch) };
      var best = null;
      for (var i = 0; i < M.people.length; i++) {
        var q = M.people[i];
        if (q === p || !q.alive || q.team === p.team) continue;
        var r = rayBody(from, dir, q);
        if (!r || r.d > w.far * 2.2) continue;
        if (best && r.d >= best.r.d) continue;
        if (!losClear(M, from, { x: q.pos.x, y: q.pos.y + 1.0, z: q.pos.z })) continue;
        best = { q: q, r: r };
      }
      /* Into the scenery, if it did not find a man first. */
      if (!best && M.game && M.game.raycast) {
        try {
          var wh = M.game.raycast([from.x, from.y, from.z], [dir.x, dir.y, dir.z],
            w.far * 2.2, notActor);
          if (wh && wh.point) {
            if (w.splash > 0) blast(M, wh.point, p, w, emit);
            else if (M.decals) M.decals.bullet(wh.point, wh.normal, w, wh.actor);
            else markAt(M, wh.point, wh.normal);
          }
        } catch (e) { /* no physics on this map */ }
      }
      /* A rocket that hits a man goes off on him, not through him. */
      if (best && w.splash > 0) {
        blast(M, { x: best.q.pos.x, y: best.q.pos.y + 1.0, z: best.q.pos.z }, p, w, emit);
      }
      if (best) {
        if (M.stats) M.stats.hits++;
        /* A head is worth what the weapon says; everything else is
           worth what the part says. A hand is not a chest. */
        var amount = damageAt(w, best.r.d)
          * (best.r.head ? w.hs : (best.r.mul != null ? best.r.mul : 1));
        /* BLOOD. Off the man, and onto whatever is behind him if
           anything is within a couple of metres -- which on these maps
           usually is. A head shot throws more of it. */
        if (M.decals) {
          var hp = { x: best.q.pos.x, y: best.q.pos.y + (best.r.head ? 1.55 : 1.15),
            z: best.q.pos.z };
          M.decals.hit(hp, dir, !!best.r.head);
          M.decals.spray(hp, dir, w);
        }
        out.push(hurt(M, p, best.q, amount, best.r.head, emit));
      }
    }
    if (p.ammo[p.held] <= 0) beginReload(M, p);
    return out;
  }

  /* ================================================================
     THE BLAST, AND WHAT IT TAKES DOWN WITH IT
     ================================================================
     Six launchers in the weapon table carry a splash radius and not
     one of them had ever produced one: a rocket did point damage to
     whatever the ray touched and marked the wall with a bullet hole.
     You could empty a launcher into a building and the building did
     not notice.

     `game.explode` is the engine's own call and it does three things
     in one -- impulses on every rigid body in range, breakage on
     anything destructible, and the light and the smoke. The map now
     has destructible pieces in it (see frail() in mp-maps), so this is
     the thing that opens a building up.

     THE DAMAGE TO PEOPLE IS OURS, not the physics'. Combatants are
     teleported capsules with no rigid body to push, and a blast that
     only moved crates would be a rocket that hurts scenery. Falloff is
     linear from the centre and a wall in the way stops it, so blowing
     a hole in the wall somebody is behind is a thing you do BEFORE you
     kill them rather than instead of. */
  function blast(M, at, from, w, emit) {
    var r = w.splash || 4.0;
    try {
      if (M.game && M.game.explode) {
        M.game.explode([at.x, at.y, at.z],
          { radius: r * 1.6, strength: 16 + r * 3.2, scale: r / 3.2, upBias: 0.35 });
      }
    } catch (e) { /* no physics on this map */ }
    if (M.decals) M.decals.scorch(at, { x: 0, y: 1, z: 0 }, r * 0.9);
    for (var i = 0; i < M.people.length; i++) {
      var q = M.people[i];
      if (!q.alive) continue;
      var mid = { x: q.pos.x, y: q.pos.y + 1.0, z: q.pos.z };
      var d = Math.hypot(mid.x - at.x, mid.y - at.y, mid.z - at.z);
      if (d > r) continue;
      if (!losClear(M, at, mid)) continue;
      /* Own team included: a rocket does not check a uniform. */
      var amount = w.dmg * (1 - (d / r) * 0.72);
      hurt(M, from, q, amount, false, emit);
    }
  }

  /* RECOIL THAT MOVES THE MAN, NOT THE GUN.
   *
     Every shot puts a real impulse into the view: the pitch climbs and
     the yaw wanders, per gun, off the same recoil figures the loadout
     screen shows. It decays back most of the way but not all of it, so
     holding the trigger walks your aim up the wall and you have to pull
     it down -- which is what recoil IS, and what a muzzle that rises
     while the camera stays level completely fails to be.

     `recoil` is where it has climbed to and `settle` is where it will
     fall back to, so the recovery returns the shot-to-shot jump and
     keeps the drift. A bot fights it the same way a player does. */
  function kickFrom(M, p, w, rand) {
    var up = w.rec[0] * Math.PI / 180, side = w.rec[1] * Math.PI / 180;
    var aim = p.aiming ? 0.72 : 1;          // braced against the shoulder
    var crouch = p.crouching ? 0.85 : 1;
    p.kickUp = (p.kickUp || 0) + up * aim * crouch;
    p.kickSide = (p.kickSide || 0) + (rand() - 0.5) * 2 * side * aim * crouch;
    /* A quarter of each shot's climb stays until you put it back. */
    p.kickHold = (p.kickHold || 0) + up * aim * crouch * 0.26;
    p.kickAt = M.time;

    /* AND THE MAN GOES BACKWARDS.
     *
       Everything above moves where he is LOOKING. That is recoil in the
       view and it is most of what recoil feels like, but it is not all
       of it: you can empty a .50 on one spot and finish on that spot,
       and a body that never moves is a body with no mass.

       Off the gun's own climb figure, so nothing has to be added to
       sixty weapon entries -- 0.24 degrees is a suppressed .22 and is
       four centimetres, 6.6 is the anti-materiel rifle and is a stumble
       -- and through the same braced and crouched terms as the view,
       because a planted stance takes recoil the same way whichever end
       of it you are measuring. Prone takes nearly all of it: there is
       no standing up to be pushed out of. */
    var prone = p.prone ? 0.25 : 1;
    var sh = w.rec[0] * 0.16 * aim * crouch * prone;
    if (sh > 0.002) {
      p.push = p.push || { x: 0, z: 0 };
      p.push.x -= Math.sin(p.yaw) * sh;
      p.push.z -= Math.cos(p.yaw) * sh;
    }
  }

  function settleKick(M, p, dt) {
    if (!p.kickUp && !p.kickSide) return;
    var k = Math.pow(0.0009, dt);           // most of it back in a fifth of a second
    p.kickUp = (p.kickUp - p.kickHold) * k + p.kickHold;
    p.kickSide *= k;
    /* And the part that stayed drains away slowly once you stop. */
    if (M.time - (p.kickAt || 0) > 0.22) p.kickHold *= Math.pow(0.30, dt);
    if (Math.abs(p.kickUp) < 1e-5) { p.kickUp = 0; p.kickHold = 0; }
    if (Math.abs(p.kickSide) < 1e-5) p.kickSide = 0;
  }

  /* HOW LONG A WEAPON TAKES TO GET OUT OF THE SHOULDER.
   *
     The one thing a weapon swap is, is a pair of animations -- the old
     gun goes down out of the frame and the new one comes up into it.
     Neither of them exists if the exchange happens in the same tick,
     and multiplayer's did: `p.held = 1 - p.held`, and the gun in your
     hands became a different gun between one frame and the next.

     By class, because that is what multiplayer knows about a weapon's
     bulk, and divided by the gun's own `swap` stat -- which has been on
     every row of the table since the table was written and which
     nothing has ever read. Attachments move it, so a quick-draw grip
     now does something. */
  var SWAP_TIME = { pistol: 0.34, smg: 0.44, shotgun: 0.52, ar: 0.52,
    lmg: 0.66, sniper: 0.62, launcher: 0.60, special: 0.46 };

  function beginSwap(M, p, n) {
    if (n < 0 || n > 1 || n === p.held) return;
    if (p.swapUntil > M.time) return;               // already mid-swap
    var w = p.guns[p.held];
    var dur = (SWAP_TIME[w && w.cls] || 0.48) / Math.max(0.4, (w && w.swap) || 1);
    p.swapFor = dur;
    p.swapUntil = M.time + dur;
    p.swapTo = n;
    /* A reload does not survive a swap. It did: the counter kept
       running on a weapon that was no longer in your hands and filled
       the magazine of the one you had put away. */
    p.reloadUntil = 0;
    // Nothing fires until the new gun is up.
    p.nextShot = Math.max(p.nextShot, p.swapUntil);
  }

  /* Run it. The exchange lands at the halfway mark, which is where the
     gun is furthest down and the change cannot be seen. */
  function runSwap(M, p) {
    if (!p.swapUntil) return;
    if (p.swapTo >= 0 && M.time >= p.swapUntil - p.swapFor * 0.5) {
      p.held = p.swapTo; p.swapTo = -1;
    }
    if (M.time >= p.swapUntil) { p.swapUntil = 0; p.swapFor = 0; }
  }

  function beginReload(M, p) {
    var w = gun(p);
    if (p.reserve[p.held] <= 0) {
      /* Out. Swap to the other gun rather than standing there, which is
         what a player does and what makes a secondary worth having. */
      var other = 1 - p.held;
      if (p.ammo[other] > 0 || p.reserve[other] > 0) beginSwap(M, p, other);
      return;
    }
    p.reloadUntil = M.time + w.reload;
  }

  function finishReload(M, p) {
    var w = gun(p);
    var want = w.mag - p.ammo[p.held];
    var got = Math.min(want, p.reserve[p.held]);
    p.ammo[p.held] += got;
    p.reserve[p.held] -= got;
  }

  function hurt(M, from, to, amount, head, emit) {
    /* THE SUIT TAKES IT FIRST. Ten thousand points of plate between a
       round and the man inside, and while it holds he cannot be hurt
       at all -- which is the whole of what an eighteen-kill streak is
       buying. `absorbHit` is installed by the Berserker module for as
       long as somebody is riding one. */
    if (to && to.inSuit && M.absorbHit && M.absorbHit(to, amount)) return 0;
    if (!to.alive) return 0;
    var dealt = Math.min(to.hp, amount);
    to.hp -= amount;
    /* When you were last hit, which is what the regeneration delay is
       counted from. It was never written down, so health came back
       during the fight rather than after it. */
    to.hurtAt = M.time;
    if (from) from.damage += dealt;
    if (to.hp > 0) {
      /* Being shot at from somewhere is how a bot learns you exist,
         even when it was looking the other way. */
      if (to.bot && from) { to.ai.target = from; to.ai.sawAt = M.time; to.ai.state = 'engage'; }
      return dealt;
    }
    to.alive = false;
    to.deaths++;
    to.streak = 0;
    to.respawnAt = M.time + Math.max(RESPAWN_FLOOR, RESPAWN);
    to.zoneLeft = 0;
    to.busy = null;
    if (from) {
      from.kills++;
      from.streak++;
      if (from.streak > from.bestStreak) from.bestStreak = from.streak;
      if (M.mode.id === 'tdm') M.score[from.team]++;
    }
    /* HE FALLS WHERE HE WAS STANDING.
     *
       This teleported the body sixty metres underground on the frame
       it died, so every death in the game was a man vanishing. He drops
       now, and which way he drops depends on where the round came from
       -- forwards onto his face if he was shot in the back, backwards
       if he was shot in the chest -- because playing one collapse for
       every death is how they all start to look the same.

       He stays down. The body is left where it fell and is only taken
       away when that same man dies again, so there is one corpse per
       player and twelve people cannot carpet the map. */
    to.dyingAt = M.time;
    // The previous one goes as this one arrives: one body per player.
    to.corpse = { x: to.pos.x, y: to.pos.y, z: to.pos.z, yaw: to.yaw };
    if (from) {
      var bx = to.pos.x - from.pos.x, bz = to.pos.z - from.pos.z;
      var fx = Math.sin(to.yaw), fz = Math.cos(to.yaw);
      // Positive means it came from behind him.
      to.corpse.face = (bx * fx + bz * fz) > 0;
    } else to.corpse.face = false;
    /* A pool spreads under him over the next few seconds and is gone
       in three minutes. */
    if (M.decals) M.decals.pool(to.corpse);
    if (to._armShown) showArm(to._armShown, false);
    var ev = { t: M.time, kind: 'kill', by: from ? from.id : null, who: to.id, head: !!head,
      weapon: from ? gun(from).id : null,
      /* Everything Best Play needs to weigh this later, taken NOW --
         the range and the score are gone a second after the fact and
         cannot be recovered from a scoreboard. */
      at: [to.pos.x, to.pos.y, to.pos.z],
      range: from ? Math.hypot(from.pos.x - to.pos.x, from.pos.z - to.pos.z) : 0,
      score: [M.score.a, M.score.b] };
    M.events.push(ev);
    emit(ev);
    return dealt;
  }

  /* ================================================================
     THE RECORDER
     ================================================================
     A kill cam and a Best Play are the same machine twice: both need to
     know where everybody WAS, not where they are, and neither can be
     reconstructed after the fact from a scoreboard.

     So the match keeps a rolling tape. Twenty samples a second -- not
     sixty, because a replay is watched at a distance and the difference
     between 20 Hz and 60 Hz of a running man is invisible while the
     memory is three times the size. Each sample is a flat array rather
     than an object per player: twelve objects a tick, twenty ticks a
     second, for a ten-minute match is fourteen million allocations and
     a garbage collector pause every few seconds, which would show up as
     exactly the stutter this game has been accused of.

     REC_SECONDS is what the kill cam needs. Best Play keeps its own
     sparser highlight list instead of a ten-minute tape, because the
     interesting parts of a match are seconds long and minutes apart. */
  var REC_HZ = 20;
  var REC_SECONDS = 8;
  var REC_STRIDE = 6;              // x, y, z, yaw, pitch, flags per person

  function recInit(M) {
    var n = M.people.length;
    M.rec = {
      hz: REC_HZ, stride: REC_STRIDE, people: n,
      frames: Math.ceil(REC_HZ * REC_SECONDS),
      data: new Float32Array(Math.ceil(REC_HZ * REC_SECONDS) * n * REC_STRIDE),
      time: new Float32Array(Math.ceil(REC_HZ * REC_SECONDS)),
      head: 0, filled: 0, acc: 0,
    };
  }

  function recSample(M, dt) {
    var R = M.rec;
    if (!R) return;
    R.acc += dt;
    if (R.acc < 1 / R.hz) return;
    R.acc = 0;
    var base = R.head * R.people * R.stride;
    for (var i = 0; i < R.people; i++) {
      var p = M.people[i], o = base + i * R.stride;
      R.data[o] = p.pos.x; R.data[o + 1] = p.pos.y; R.data[o + 2] = p.pos.z;
      R.data[o + 3] = p.yaw; R.data[o + 4] = p.pitch;
      /* One float of state, packed: alive, firing, sprinting,
         crouching, prone, aiming. A replay that shows everybody
         standing upright and still is a replay of a diagram -- and
         one that shows a man who died flat on his face standing up to
         be shot is worse, because it is a replay of something that
         did not happen. Prone and aiming were both missing. */
      R.data[o + 5] = (p.alive ? 1 : 0) + (M.time - (p.lastShotAt || -9) < 0.12 ? 2 : 0)
        + (p.sprinting ? 4 : 0) + (p.crouching ? 8 : 0)
        + (p.prone ? 16 : 0) + (p.aiming ? 32 : 0);
    }
    R.time[R.head] = M.time;
    R.head = (R.head + 1) % R.frames;
    if (R.filled < R.frames) R.filled++;
  }

  /* Read the tape at a time, interpolating between the two samples
     either side of it -- twenty a second is smooth enough to watch only
     if it is not also played back at twenty. */
  function recAt(M, t, out) { return tapeAt(M.rec, t, out); }

  function tapeAt(R, t, out) {
    if (!R || !R.filled) return null;
    var oldest = (R.head - R.filled + R.frames) % R.frames;
    var a = -1, b = -1, f = 0;
    for (var k = 0; k < R.filled - 1; k++) {
      var i0 = (oldest + k) % R.frames, i1 = (oldest + k + 1) % R.frames;
      if (R.time[i0] <= t && R.time[i1] >= t) {
        a = i0; b = i1;
        var span = R.time[i1] - R.time[i0];
        f = span > 1e-6 ? (t - R.time[i0]) / span : 0;
        break;
      }
    }
    if (a < 0) {
      /* Off either end of the tape: hold the nearest frame rather than
         returning nothing, so a playback that overshoots by a frame
         freezes for a frame instead of snapping back to live state. */
      a = b = R.time[oldest] > t ? oldest : (R.head - 1 + R.frames) % R.frames;
      f = 0;
    }
    out = out || [];
    for (var i = 0; i < R.people; i++) {
      var oa = a * R.people * R.stride + i * R.stride;
      var ob = b * R.people * R.stride + i * R.stride;
      var e = out[i] || (out[i] = {});
      e.x = R.data[oa] + (R.data[ob] - R.data[oa]) * f;
      e.y = R.data[oa + 1] + (R.data[ob + 1] - R.data[oa + 1]) * f;
      e.z = R.data[oa + 2] + (R.data[ob + 2] - R.data[oa + 2]) * f;
      /* Yaw wraps, and lerping across the wrap spins a man round twice
         in a tenth of a second. Take the short way. */
      var dy = R.data[ob + 3] - R.data[oa + 3];
      while (dy > Math.PI) dy -= Math.PI * 2;
      while (dy < -Math.PI) dy += Math.PI * 2;
      e.yaw = R.data[oa + 3] + dy * f;
      e.pitch = R.data[oa + 4] + (R.data[ob + 4] - R.data[oa + 4]) * f;
      /* Flags are not interpolated -- half a muzzle flash is not a
         thing. Take the frame we are nearest to. */
      var fl = R.data[(f < 0.5 ? oa : ob) + 5];
      e.alive = !!(fl & 1); e.firing = !!(fl & 2);
      e.sprinting = !!(fl & 4); e.crouching = !!(fl & 8);
      e.prone = !!(fl & 16); e.aiming = !!(fl & 32);
    }
    out.length = R.people;
    return out;
  }

  /* How far back the tape goes, so a caller can ask for a window it
     actually has rather than one it would like. */
  function recSpan(M) {
    var R = M.rec;
    if (!R || R.filled < 2) return null;
    var oldest = (R.head - R.filled + R.frames) % R.frames;
    var newest = (R.head - 1 + R.frames) % R.frames;
    return { from: R.time[oldest], to: R.time[newest] };
  }

  /* Cut a standalone tape out of the rolling one. A clip is the same
     shape as the ring buffer with its head parked at zero and the
     buffer exactly full, so tapeAt reads it without knowing which it
     has been handed. */
  function clipOut(R, t0, t1) {
    if (!R || R.filled < 2) return null;
    var oldest = (R.head - R.filled + R.frames) % R.frames;
    var from = -1, to = -1;
    for (var k = 0; k < R.filled; k++) {
      var i = (oldest + k) % R.frames;
      if (R.time[i] >= t0 && from < 0) from = k > 0 ? k - 1 : k;   // one frame of lead-in
      if (R.time[i] <= t1) to = k;
    }
    if (from < 0) from = 0;
    if (to < from) to = Math.min(R.filled - 1, from + 1);
    if (to < R.filled - 1) to++;                                    // and one of lead-out
    var n = to - from + 1;
    if (n < 2) return null;
    var w = R.people * R.stride;
    var clip = {
      hz: R.hz, stride: R.stride, people: R.people,
      frames: n, head: 0, filled: n,
      data: new Float32Array(n * w), time: new Float32Array(n),
    };
    for (var f2 = 0; f2 < n; f2++) {
      var src = ((oldest + from + f2) % R.frames) * w;
      clip.data.set(R.data.subarray(src, src + w), f2 * w);
      clip.time[f2] = R.time[(oldest + from + f2) % R.frames];
    }
    return clip;
  }

  /* ================================================================
     BEST PLAY
     ================================================================
     "Replay the best moment of the match." Which means deciding what
     best IS, and that decision is the whole feature -- a highlight reel
     that picks the wrong five seconds is worse than none, because it
     tells the player the game was not watching.

     What it weighs, in the order the weights say:

       a multi-kill      most. Two men inside four seconds is the thing
                         anybody would clip, and three is the match.
       a long shot       a kill at sixty metres is a different act from
                         one at six, and the range is recorded per kill
                         because it cannot be recovered afterwards.
       a headshot        a choice rather than an accident, mostly.
       being behind      the same double kill means more when your side
                         was losing, which is why the score at the
                         moment of the kill is on the event.
       surviving it      a trade where you died a second later is not a
                         best play, it is a mutual accident.

     Ties go to the LATER moment, because a match builds.

     The rolling tape is eight seconds long and a match is ten minutes,
     so a best play found at the end cannot be replayed from it. Runs
     are therefore scored as they close and the good ones are CUT OUT
     of the tape at the time, keeping the best four. Four clips of four
     seconds is about ninety kilobytes; a ten-minute tape of everybody
     would be eleven megabytes and would be thrown away unwatched. */
  var HL_WINDOW = 4.0;      // kills this close together are one play
  var HL_LEAD = 2.2;        // seconds of run-up shown before the first
  var HL_TAIL = 1.4;        // and of aftermath after the last
  var HL_KEEP = 4;

  function hlInit(M) {
    M.highlights = [];
    M._hlPend = [];
    M._hlSeen = 0;
  }

  /* Score one run of kills. Returns null for a run that should not be
     considered at all (a suicide, a killer who has left). */
  function hlScore(M, run) {
    var k = run[0], who = M.people[k.by];
    if (!who) return null;
    var n = run.length;
    var score = n * n * 100;                            // a double is 4x a single
    var far = 0, heads = 0;
    for (var r = 0; r < run.length; r++) {
      far = Math.max(far, run[r].range || 0);
      if (run[r].head) heads++;
    }
    score += Math.min(60, far) * 1.6;
    score += heads * 45;
    /* Behind at the time. The kill carries the score as it stood, so
       this is what the board said then and not what it says now. */
    var mine = k.score ? k.score[who.team === 'a' ? 0 : 1] : 0;
    var theirs = k.score ? k.score[who.team === 'a' ? 1 : 0] : 0;
    if (theirs > mine) score += Math.min(40, (theirs - mine) * 8);
    // Died right after: a trade, not a play.
    var last = run[run.length - 1];
    var diedAfter = M.events.some(function (e) {
      return e.kind === 'kill' && e.who === k.by && e.t > k.t && e.t < last.t + HL_TAIL + 1.5;
    });
    if (diedAfter) score *= 0.55;
    return {
      score: score, by: k.by, name: who.name, team: who.team,
      kills: n, heads: heads, range: far,
      from: k.t - HL_LEAD, to: last.t + HL_TAIL, at: k.at, t: k.t,
    };
  }

  /* Called every tick. Groups new kills into runs, then cuts out the
     ones worth keeping once their window has closed. */
  function hlTick(M) {
    var P = M._hlPend;
    for (; M._hlSeen < M.events.length; M._hlSeen++) {
      var e = M.events[M._hlSeen];
      if (e.kind !== 'kill' || e.by == null || e.by === e.who) continue;
      var open = null;
      for (var i = 0; i < P.length; i++) {
        if (P[i].by === e.by && e.t - P[i].run[0].t <= HL_WINDOW) { open = P[i]; break; }
      }
      if (open) open.run.push(e);
      else P.push({ by: e.by, run: [e] });
    }
    for (var j = P.length - 1; j >= 0; j--) {
      var p = P[j], last = p.run[p.run.length - 1];
      /* Closed once no further kill can join the run AND the tail we
         mean to show has actually been recorded. */
      if (M.time < Math.max(p.run[0].t + HL_WINDOW, last.t + HL_TAIL) + 0.25) continue;
      P.splice(j, 1);
      var h = hlScore(M, p.run);
      if (!h) continue;
      var worst = M.highlights.length >= HL_KEEP
        ? M.highlights.reduce(function (a, b) { return b.score < a.score ? b : a; })
        : null;
      if (worst && h.score <= worst.score) continue;
      var span = recSpan(M);
      if (span) h.from = Math.max(h.from, span.from);
      h.clip = clipOut(M.rec, h.from, h.to);
      if (!h.clip) continue;
      if (worst) M.highlights.splice(M.highlights.indexOf(worst), 1);
      M.highlights.push(h);
    }
  }

  /* End of match: close anything still open, then hand back the best
     one. Ties go to the later moment. */
  function bestPlay(M) {
    if (M._hlPend && M._hlPend.length) {
      var save = M.time;
      M.time = 1e9;                 // force every pending run closed
      hlTick(M);
      M.time = save;
    }
    var best = null;
    for (var i = 0; i < M.highlights.length; i++) {
      var h = M.highlights[i];
      if (!best || h.score > best.score || (h.score === best.score && h.t > best.t)) best = h;
    }
    return best;
  }

  /* ================================================================
     MOVING
     ================================================================
     Bodies are moved kinematically against the navigation grid rather
     than by pushing a physics capsule about.

     Two reasons, and the second is the important one. A capsule driven
     by forces gets wedged on a step, and a bot wedged on a step stands
     there for the rest of the round doing nothing while eleven people
     play a different game. And a headless run has no physics tick, so
     a match simulated for a test would move nobody -- which would make
     the test that proves the map is playable the one thing that never
     actually walks it.

     So: steer, try the whole step, and if the cell ahead is solid try
     the two axes separately, which is what makes a body slide along a
     wall instead of sticking to it. The visible actor is then placed
     where the simulation says it is. */

  function cellBlocked(nav, x, z) {
    var i = Math.floor((x - nav.box.x0) / nav.c), j = Math.floor((z - nav.box.z0) / nav.c);
    return navBlocked(nav, i, j);
  }

  var notActor = function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); };

  /* THE FLOOR UNDER A POINT, and it tries three times.
   *
     A ray that starts INSIDE a solid does not report that solid, so a
     body whose feet are in the side wall of Resort's drained pool cast
     down from within it, found nothing at all, and fell. Casting again
     from well above clears whatever it was standing in and finds the
     real floor. Three heights, because one of them being wrong is how
     a man ends up at minus five metres. */
  function groundAt(M, x, z, from) {
    var y0 = from == null ? 8 : from;
    for (var i = 0; i < 3; i++) {
      var start = i === 0 ? y0 : (i === 1 ? y0 + 3.0 : y0 + 14.0);
      var h = M.game.raycast([x, start, z], [0, -1, 0], 60, notActor);
      /* A floor above the feet is not the floor you are on -- that is
         a ceiling, and taking it is how a body teleports upstairs. */
      if (h && h.point.y <= y0 + 0.02) return h.point.y;
    }
    return null;
  }

  var GRAVITY = 19.6, JUMP = 6.0, STEP_UP = 0.62;

  function moveBy(M, p, vx, vz, dt, jump) {
    /* THE SHOVE RIDES ALONG WITH THE WALK.
     *
       A round leaving the barrel takes momentum with it and the man
       keeps the rest, so kickFrom puts a push on him and this is where
       he wears it. Added to whatever he is walking at rather than
       replacing it, and decayed on its own clock, so he can fight it
       and still be moved by it.

       Put here and not at the call sites because there are five of
       those -- a bot advancing, a bot backing off, a bot running a
       lane, a slide, and a player -- and a shove that only some of
       them felt would be a shove only some of them felt.

       Grounded you plant a foot and it is gone in about a third of a
       second. In the air there is no foot to plant, which is why the
       two rates are not the same number. */
    if (p.push && (p.push.x || p.push.z)) {
      vx += p.push.x; vz += p.push.z;
      var pk = Math.pow(p.grounded ? 0.004 : 0.35, dt);
      p.push.x *= pk; p.push.z *= pk;
      if (Math.abs(p.push.x) < 1e-3) p.push.x = 0;
      if (Math.abs(p.push.z) < 1e-3) p.push.z = 0;
    }
    var nx = p.pos.x + vx * dt, nz = p.pos.z + vz * dt;
    if (!cellBlocked(M.nav, nx, nz)) { p.pos.x = nx; p.pos.z = nz; }
    else {
      if (!cellBlocked(M.nav, nx, p.pos.z)) p.pos.x = nx;
      if (!cellBlocked(M.nav, p.pos.x, nz)) p.pos.z = nz;
    }
    /* Vertical properly, rather than snapping to whatever is underneath.
     *
       Snapping meant a body could step up a wall as easily as a kerb and
       could not fall off anything at all. Now there is a step height --
       stairs are a 0.26 rise, so 0.62 takes a step and refuses a wall --
       and everything else is gravity. Which also gives the player a jump
       without a second movement path to keep in step with this one. */
    /* THE GROUND RAY STARTS AT THE FEET, plus a step.
     *
       It started 2.4 metres above them, and the test for standing was
       "the floor is no more than a step BELOW me" -- which is satisfied
       by a floor any distance ABOVE me. So anything the ray found on
       the way down, up to two and a half metres up, counted as ground
       and the body was snapped on top of it. A man could walk into the
       side of a spawn screen and be standing on it, walk off the far
       side, and end up somewhere with nothing underneath at all.

       Starting the ray a step above the feet means the only floors it
       can find are ones you could actually step onto. */
    var g = groundAt(M, p.pos.x, p.pos.z, p.pos.y + STEP_UP + 0.05);
    p.vy = p.vy || 0;
    var onFloor = g != null && p.pos.y - g <= STEP_UP && p.vy <= 0.001;
    if (onFloor) {
      p.pos.y = g; p.vy = 0; p.grounded = true;
      p.lastGood = { x: p.pos.x, y: g, z: p.pos.z };
      if (jump) { p.vy = JUMP; p.grounded = false; }
    } else {
      p.grounded = false;
      p.vy -= GRAVITY * dt;
      p.pos.y += p.vy * dt;
      if (g != null && p.pos.y <= g) {
        p.pos.y = g; p.vy = 0; p.grounded = true;
        p.lastGood = { x: p.pos.x, y: g, z: p.pos.z };
      } else if (g == null && p.lastGood && p.pos.y < p.lastGood.y - 0.5) {
        /* NOTHING UNDERNEATH, and half a metre gone.
         *
           Not a fall -- a fall finds a floor the whole way down and is
           handled above. This is the case where three separate casts
           found nothing at all, which on Resort means a body has walked
           sideways out of the drained pool THROUGH its wall into the
           void under the terrace. It can do that because the navigation
           grid is swept at chest height and a pit two and a half metres
           down is invisible to it.

           Half a metre is the threshold because half a metre of
           unexplained fall is already enough to know something is
           wrong, and putting a body back where it last stood is better
           than letting it drop out of the match. Unlike killing it,
           this leaves no hole in the scoreboard for a bug of ours. */
        p.pos.x = p.lastGood.x; p.pos.y = p.lastGood.y; p.pos.z = p.lastGood.z;
        p.vy = 0; p.grounded = true;
      }
    }
  }

  /* WHERE THE BODY IS PUT, AND WHAT IT IS HOLDING.
     ================================================================
     This used to live at the bottom of moveBy, which meant a body was
     only placed on the frames it MOVED on. Everything downstream of it
     inherited that: the level of detail was decided from a distance
     last measured while walking, and carry() -- which is what puts a
     rifle in a man's hands -- was never reached at all by anybody
     standing still.

     So: a bot that reached cover and held it had no weapon. A corpse
     was never moved to the spot it fell on, because the dead do not
     call the mover. And on the very first frames of a match, before
     anyone had taken a step, twelve men stood at the spawns holding
     nothing, which is exactly what was reported -- "the bots' guns are
     invisible" -- and exactly what a photograph of a standing bot
     showed: an actor still sitting at the origin it was built at.

     Placement is not a consequence of moving. It is what is true every
     frame, so it runs every frame, for everybody, alive or dead. */
  function place(M, p) {
    if (!p.actor || !p.actor.controller || M.replaying) return;
    /* A corpse stays at the spot it fell on, not at the live position
       -- the man it belonged to is about to respawn across the map and
       his body must not go with him. */
    var at = (!p.alive && p.corpse) ? p.corpse : p.pos;
    p.actor.controller.teleport([at.x, at.y + lift(p), at.z]);
    face(p.actor, (!p.alive && p.corpse) ? p.corpse.yaw : p.yaw);
    var dx = M.you ? at.x - M.you.pos.x : 0;
    var dz = M.you ? at.z - M.you.pos.z : 0;
    var near = lod(M, p, dx * dx + dz * dz);
    carry(M, p, p.yaw, p.pitch, p.sprinting, p.alive && near);
  }

  /* Every body in this match is TELEPORTED into place each frame -- the
     match owns movement and the engine's controller is only a thing to
     hang a mesh and a skeleton on. Teleport zeroes the controller's
     velocity, so the controller's own animation state machine saw
     twelve men standing perfectly still while they sprinted across
     Town, and played 'idle' at all of them for the entire match. The
     bodies slid around the map in the T-adjacent bind pose and nobody
     noticed because nobody had looked at a bot from the outside.

     So the state is chosen HERE, from what the match knows, and the
     speed is measured from the position actually travelled rather than
     from any velocity field -- the match has three or four paths that
     move a body and only some of them bother to record why. */
  /* ================================================================
     THE GUN IN HIS HANDS
     ================================================================
     Nobody in this match was carrying anything. Twelve people in a
     firefight with empty hands, shooting each other with weapons that
     existed only as numbers -- and the engine has fifty-seven fully
     modelled ones sitting in a cache. It is the single largest thing
     missing from a shot of this game.

     THE MODEL IS THE REAL ONE. The same serviceArm build the
     viewmodel uses, so the man across the street is holding the gun
     the kill feed is about to name. Geometry is cached per weapon id
     inside the engine (armCache), so twelve men carrying four
     different rifles between them build four models, not twelve.

     IT IS PLACED IN THE MAN'S FRAME, NOT ON HIS HAND. Attaching it to
     the hand bone tracks the arm, which sounds better and is worse:
     these bodies swing their arms like a man walking to the shops,
     because the walk cycle does not know he is armed. A rifle riding
     that swing is a rifle being waved about. Carried at the chest and
     pointed where he is pointed, it reads as a weapon at the ready
     from any distance anybody will ever see it from.

     (The upper body should have its own carry pose, and then the hand
     is the right place for it. That is a bigger job than this one and
     is not pretended at here.) */

  /* BUILT BEFORE THE MATCH, NEVER DURING IT.
     A weapon is several thousand vertices of receiver, rifling and
     individual brass rounds, assembled in JavaScript the frame it is
     first asked for. Measured, the match tick runs at 0.30ms and spikes
     to 22.6 -- seventy-five times the median, in the middle of a
     gunfight, every time somebody respawns holding something new. That
     spike is invisible in an average frame rate and is exactly what
     "it feels glitchy" describes. Twenty-four weapons on the loading
     screen instead, where the geometry cache means four distinct
     rifles cost four builds however many people are carrying them. */
  function warmArms(M) {
    for (var i = 0; i < M.people.length; i++) {
      var p = M.people[i], was = p.held;
      for (var k = 0; k < p.guns.length; k++) {
        p.held = k;
        // Built and put away; carry() brings out whichever is in hand.
        showArm(armOf(M, p), false);
      }
      p.held = was;
    }
  }

  /* ================================================================
     LEVEL OF DETAIL
     ================================================================
     Measured, on Town, with twelve people in it:

       weapons  214,200 vertices
       heads    126,700
       bodies    21,000
       the map   16,500
       gear      13,900

     The guns are THIRTEEN TIMES THE WHOLE MAP. Each one is about
     seventeen thousand vertices of receiver, rifling, checkering and
     individual brass rounds visible through a smoked magazine -- built
     to be looked at from thirty centimetres in a viewmodel, and drawn
     here at thirty metres where the whole weapon is forty pixels wide.
     The heads are ten thousand apiece including a separate eyeball
     mesh with an iris in it, at a range where the entire face is six
     pixels across.

     None of that detail survives the distance, and all of it is drawn
     three times a frame -- once per shadow cascade and once for real.

     So it comes off with range. The numbers are where the feature
     stops being visible rather than where it stops being expensive:

       a face      past about fourteen metres the eyes, brows, beard
                   and hair are under a pixel each.
       a weapon    past forty it is a dark smudge against a leg, and
                   the silhouette it contributes is the man's arm.
       kit         past fifty-five a pouch is not a thing you can see.

     Nothing that changes the SHAPE of a man comes off at any range --
     his helmet, his body and his stance are how you identify him
     across a street, and that is worth more than the frame. */
  /* Two thresholds each, not one. A man standing exactly on the line
     flips every frame, and each flip walks his whole actor tree
     turning meshes on and off -- which showed up immediately as the
     match tick's p95 going from 1.9ms to 4.4 the moment this landed.
     Hide it late, bring it back early. */
  var LOD_FACE_OFF = 14 * 14, LOD_FACE_ON = 12 * 12;
  var LOD_GUN_OFF = 40 * 40, LOD_GUN_ON = 36 * 36;
  var LOD_GEAR_OFF = 55 * 55, LOD_GEAR_ON = 50 * 50;
  var FACE_PARTS = ['eyes', 'brows', 'beard', 'hair'];

  function lodShow(a, on) {
    if (!a || a.visible === on) return;
    a.visible = on;
    if (a.children) for (var i = 0; i < a.children.length; i++) lodShow(a.children[i], on);
  }

  function lod(M, p, d2) {
    var a = p.actor;
    if (!a) return false;
    /* NEVER YOUR OWN BODY.
     *
       You are hidden from yourself for the whole match because the
       camera lives inside your head. Your distance to yourself is
       zero, which is the nearest possible range, so this cheerfully
       turned your eyes, your hair, your beard and your skull back ON
       -- and a first-person camera inside a head that is being drawn
       sees a featureless dark mass filling the middle of the screen.

       I spent a long time certain that mass was the weapon, moved the
       weapon twice, and photographed a picture that had not changed. */
    if (M.you && p.id === M.you.id) return false;
    var face = p._lodFace == null ? d2 < LOD_FACE_ON
      : (p._lodFace ? d2 < LOD_FACE_OFF : d2 < LOD_FACE_ON);
    if (p._lodFace !== face) {
      p._lodFace = face;
      for (var i = 0; i < FACE_PARTS.length; i++) lodShow(a[FACE_PARTS[i]], face);
    }
    var kit = p._lodGear == null ? d2 < LOD_GEAR_ON
      : (p._lodGear ? d2 < LOD_GEAR_OFF : d2 < LOD_GEAR_ON);
    if (p._lodGear !== kit) {
      p._lodGear = kit;
      if (a.gear) for (var j = 0; j < a.gear.length; j++) lodShow(a.gear[j], kit);
    }
    p._lodGun = p._lodGun == null ? d2 < LOD_GUN_ON
      : (p._lodGun ? d2 < LOD_GUN_OFF : d2 < LOD_GUN_ON);
    return p._lodGun;
  }

  /* After a replay the flags are stale -- the replay showed and hid
     bodies for its own reasons -- so the next live frame re-decides. */
  function lodReset(M) {
    for (var i = 0; i < M.people.length; i++) {
      M.people[i]._lodFace = null; M.people[i]._lodGear = null;
      M.people[i]._lodGun = null;
    }
  }

  function armOf(M, p) {
    if (!p.actor || !M.game) return null;
    var g = gun(p);
    var id = g && (g.id || g.base);
    if (!id) return null;
    p._arms = p._arms || {};
    if (p._arms[id] !== undefined) return p._arms[id];
    /* THE SAME MODEL THE VIEWMODEL USES.
     *
       This built the third-person weapon with serviceArm(id) directly,
       so every hand-built gun in the engine was missing from the man
       across the street even after mp-game's VM_BESPOKE was fixed to
       use them in your own hands. The Thompson you carry and the
       Thompson he carries were two different weapons, and the one he
       had was the generic table arm -- the exact fault, in the exact
       shape, that "the Thompson is completely wrong" turned out to be,
       surviving in the other representation because the two build
       their models in different files.

       The map is read out of mp-game.js rather than duplicated, for
       the reason roster.test.js gives: a second copy agrees with
       itself and not with the game. */
    var made = null;
    var fn = W.MP_VM_BESPOKE && W.MP_VM_BESPOKE[id];
    if (fn && typeof M.game[fn] === 'function') {
      try { made = M.game[fn]({ at: [0, -90, 0], physics: false }); } catch (e) { made = null; }
    }
    if (!made) {
      try { made = M.game.serviceArm(id, { at: [0, -90, 0], physics: false }); }
      catch (e) { made = null; }
    }
    if (!made) {
      /* A gun with no model is the wrong gun, never an empty hand. */
      try { made = M.game.serviceArm('m4', { at: [0, -90, 0], physics: false }); }
      catch (e2) { made = null; }
    }
    /* THE ROUNDS COME OUT.
       Measured, the two heaviest parts of every weapon in the scene
       are `shell` and `tip` -- the brass cases and copper bullet tips
       of the individual cartridges, fourteen thousand vertices of them
       on one MP40. They are modelled so you can see them through a
       smoked magazine from thirty centimetres in a viewmodel. On a man
       across the street they are inside a magazine WELL, behind opaque
       steel, and they cost more than everything else he is wearing put
       together. */
    if (made) {
      ['shell', 'tip'].forEach(function (n) {
        var part = made[n];
        if (part && part !== made) { part.visible = false; part.__lodDropped = true; }
      });
    }
    p._arms[id] = made;
    return made;
  }

  function showArm(a, on) {
    if (!a) return;
    if (a.visible === on) return;
    a.visible = on;
    if (a.partNames) {
      for (var i = 0; i < a.partNames.length; i++) {
        var c = a[a.partNames[i]];
        // Parts dropped for good stay dropped; see armOf.
        if (c && c !== a && !c.__lodDropped) c.visible = on;
      }
    }
  }

  /* Carried at the chest, muzzle where he is looking. Dropped to a low
     ready at a sprint, because a man running flat out does not hold a
     rifle level -- and the same drop is what the player's own
     viewmodel does, so the two views agree about what sprinting looks
     like. */
  function carry(M, p, yaw, pitch, sprinting, aliveNow) {
    if (!p.actor) return;
    /* Not your own. You are inside your own head and the viewmodel is
       already there; a third-person rifle in the same place is a rifle
       across the middle of your screen. A replay is the exception --
       there the camera is somewhere else and you are a man like any
       other, so you get your gun back. */
    if (p.id === M.you.id && !M.replaying) {
      if (p._armShown) showArm(p._armShown, false);
      return;
    }
    var a = armOf(M, p);
    if (!a) return;
    if (p._armShown && p._armShown !== a) showArm(p._armShown, false);
    p._armShown = a;
    /* A man with no weapon on screen must not be reaching for one. */
    if (!aliveNow) { showArm(a, false); p._reachGun = null; return; }
    showArm(a, true);

    var cy = Math.cos(yaw), sy = Math.sin(yaw);
    var cp = Math.cos(pitch), sp = Math.sin(pitch);
    var fx = sy * cp, fy = -sp, fz = cy * cp;
    var rx = -cy, rz = sy;                       // see face()/RIGHT: right is -X
    /* The sprint carry EASES down and back up, like the aim does. It was
       a switch: the frame a bot broke into a sprint his rifle jumped ten
       centimetres and twenty-three degrees, and jumped back the frame he
       stopped. Down in about a quarter second, up a little quicker (a
       man coming out of a run brings the gun up with purpose), and the
       smoothstep takes the corners off both ends. */
    var wantLow = sprinting ? 1 : 0;
    p._lowT = p._lowT == null ? wantLow
      : p._lowT + Math.max(-DT_LAST * 5.5, Math.min(DT_LAST * 4.0, wantLow - p._lowT));
    var low = p._lowT * p._lowT * (3 - 2 * p._lowT);
    /* AIMED, FROM THE OUTSIDE.
     *
       Bots aim -- coneOf has narrowed their cone for aiming since the
       difficulties were written -- and from across the street it made
       no difference at all to what they looked like, because this
       function only knew about sprinting. A man on his sights holds the
       weapon UP, at his eye, and IN, on his own centre line: the stock
       is in his shoulder pocket and his head is behind the rear sight.
       That is three numbers, and without them every bot in the game
       shoots from the hip forever however well it is actually
       shooting.

       `aim` eases rather than switching, the same way the player's own
       viewmodel does, so the two views agree about how long it takes
       to bring a rifle up. */
    var wantAim = (p.aiming && !sprinting) ? 1 : 0;
    p._adsT = p._adsT == null ? wantAim
      : p._adsT + (wantAim - p._adsT) * Math.min(1, DT_LAST * (wantAim ? 13 : 9));
    var aim = p._adsT;
    var h = p.pos.y + (EYE - 0.30) - (p.prone ? 1.02 : (p.crouching ? 0.42 : 0))
      - low * 0.10
      /* Up to the eye: the carry sits 0.30 below it, so that is what
         has to come back. */
      + aim * 0.26;
    /* In towards the centre line, and a touch further forward, because
       the support hand comes back under the handguard.

       NOT ALL THE WAY IN. This used to take the weapon to 1.5 cm off
       the centre line on the sights, which put the stock on his
       sternum and -- once the arms actually followed the weapon --
       both hands and both forearms across his own face. A rifle is
       shouldered in the pocket, six or seven centimetres to the firing
       side, and the head comes across to it; the weapon does not come
       to the nose. Nobody could see that while the gun was held by
       nobody, which is why it survived three rounds of tuning the
       height. */
    var side = 0.11 * (1 - aim * 0.455), ahead = 0.17 + aim * 0.055;
    a.position.set(
      p.pos.x + rx * side + fx * ahead,
      h + fy * ahead,
      p.pos.z + rz * side + fz * ahead
    );
    /* Same convention the viewmodel uses: yaw about Y, then the pitch
       as a roll about Z, because that is the axis the gun models are
       built along. */
    var fh = Math.hypot(fx, fz) || 1e-6;
    var gy = Math.atan2(-fz / fh, fx / fh);
    var gp = Math.asin(Math.max(-1, Math.min(1, fy))) - low * 0.55;
    /* The muzzle comes level as the sights come up: the carry has the
       weapon nosed down a few degrees and an aimed weapon has not. */
    gp += aim * 0.06;
    if (!_q1) { _q1 = new W.LE.Quat(); _q2 = new W.LE.Quat(); }
    _q1.setEuler(0, gy, 0);
    _q2.setEuler(0, 0, gp);
    _q1.mulQuats(_q1, _q2);
    if (low > 1e-3) { _q2.setEuler(0.40 * low, 0, 0); _q1.mulQuats(_q1, _q2); }
    a.rotation.copy(_q1);
    a._still = false;
    /* The reach cannot happen here. The engine updates every actor's
       animator after the match has finished its tick, so a pose solved
       now is overwritten before it is ever drawn -- which it was, every
       frame, until I stopped assuming and looked at who else was
       touching the skeleton. It runs from the animator's own onPosed
       instead; all this does is leave it the numbers. */
    p._reachGun = a;
    p._reachAim = aim;
    if (p.actor.animator && !p.actor.animator.onPosed) {
      p.actor.animator.onPosed = function () {
        if (p._reachGun) reachForWeapon(p, p._reachGun, p._reachAim || 0);
      };
    }
  }

  /* HANDS ONTO THE WEAPON.
   *
     The stock humanoid clip set has nineteen clips in it and not one
     of them holds a gun -- they are all locomotion, and every one
     swings both arms like a man jogging empty-handed. Measured on a
     bot with `aiming` true: hands at y 0.12 and 0.21 against a head at
     0.568, and the clip playing was `run`. So the rifle sat at his
     shoulder held by nobody, a foot and a half above and in front of
     where his hands were.

     THE POSE AND THE WEAPON WERE TWO SEPARATE SOLVES. The gun's place
     is worked out from the pelvis and the facing; the hands come from
     the skeleton; and nothing ever reconciled them. Authoring an arm
     pose to match would reconcile them for one weapon at one distance
     and drift the moment either number moved -- and both move, because
     the carry drops at a sprint and rises 26 cm to the eye on ADS.

     So: solve the arms to where the weapon actually IS. The gun is the
     authority, because its height is a tuned number that took three
     goes to get right ("the gun is STILL carried too high"), and the
     arms follow it. Two-bone IK, which the skeleton already has for
     planting feet.

     THE SPACES ARE THE WHOLE TRICK. A bone's worldMatrix here is built
     from the bone hierarchy alone, so it is ACTOR-LOCAL -- the hips sit
     at the origin. The gun is placed in world space. Feeding one into
     the other puts the target forty metres away across the map, which
     is what `applyQuatInv` against the actor's rotation is for.

     The firing hand goes to the gun's own origin, because svcSpec sets
     every weapon's origin to its grip -- the same convention the
     viewmodel's hand solve relies on, so the two representations agree
     by construction rather than by two sets of numbers. */
  var _ikA = null, _ikB = null, _ikP = null, _ikInv = null, _ikS = null, _ikU = null;
  var _ikQ = null, _ikY = null;
  function reachForWeapon(p, gunA, aim) {
    var actor = p.actor, sk = actor && actor.skeleton;
    if (!sk || !sk.solveIK || !sk.index) return;
    var iUR = sk.index('upperArmR'), iLR = sk.index('lowerArmR'), iHR = sk.index('handR');
    var iUL = sk.index('upperArmL'), iLL = sk.index('lowerArmL'), iHL = sk.index('handL');
    if (iUR < 0 || iLR < 0 || iHR < 0 || iUL < 0 || iLL < 0 || iHL < 0) return;
    if (!_ikA) {
      _ikA = new W.LE.Vec3(); _ikB = new W.LE.Vec3(); _ikP = new W.LE.Vec3();
      _ikS = new W.LE.Vec3(); _ikU = new W.LE.Vec3();
      _ikInv = new W.LE.Mat4();
    }

    /* BLADE THE STANCE BEFORE SOLVING ANYTHING.
     *
       With the torso square to the front the support hand cannot reach
       a shouldered weapon, and that is not a limitation of the solver,
       it is arithmetic. The left shoulder sits 17 cm to his left and
       3 cm ahead of the hips; a rifle at the eye puts its forend grip
       43 cm ahead of the head and 6 cm to the right; the straight-line
       distance between those is 58 cm and the arm is 50. It was eight
       centimetres short, every time, on every rifle -- which is why
       choking the hand back to the reachable point left it almost
       touching the firing hand on an MP5 and looked like a man
       clasping something rather than holding it.

       A person closes that eight centimetres by turning: the support
       shoulder comes forward and across, which is the bladed stance
       everybody who has ever shouldered a rifle stands in, and which
       exists for exactly this reason rather than for style. Thirty-five
       degrees of chest rotation moves the left shoulder 3 cm right and
       10 cm forward and brings the same reach to 49.6 cm -- inside the
       arm, with a centimetre to spare. The number is not a taste; it
       is the angle at which the hand can get there.

       Now thirty-nine at full aim (0.20 + 0.48 rad): with the pelvis no
       longer inheriting a stale forward tilt from the last run cycle,
       thirty-five left the Thompson 4 mm short of a second grip, and a
       bladed stance runs thirty to forty-five in any case.

       The head does NOT go with it. A shooter's torso blades and his
       head stays square, looking down the sights, so the neck takes the
       same rotation back. Without that he aims nearly forty degrees off
       the thing he is shooting at, which the kill cam would show. */
    var iChest = sk.index('chest'), iNeck = sk.index('neck'), iSpine = sk.index('spine');
    if (iChest >= 0) {
      if (!_ikQ) _ikQ = new W.LE.Quat();
      if (!_ikY) _ikY = new W.LE.Vec3(0, 1, 0);
      /* AND LEAN INTO IT. A shouldered rifle is fired from an
         aggressive stance -- nose over toes, the weight on the balls of
         the feet -- and the forward lean is what takes the recoil and
         what brings the support shoulder the last centimetre down the
         handguard. This used to be supplied by accident: the idle kept
         whatever pelvis tilt the last run cycle left in the animator's
         pose object (see AnimationClip.sample), and when that went the
         reach dropped by exactly the lean it had been lending. The neck
         takes it back out, as it does the blade, so the eyes stay on
         the sights. */
      if (iSpine >= 0 && aim > 1e-3) {
        _ikQ.setEuler(0.16 * aim, 0, 0);
        sk.bones[iSpine].localRotation.mul(_ikQ).normalize();
        if (iNeck >= 0) {
          _ikQ.setEuler(-0.16 * aim, 0, 0);
          sk.bones[iNeck].localRotation.mul(_ikQ).normalize();
        }
      }
      var blade = -(0.20 + aim * 0.48);
      _ikQ.setAxisAngle(_ikY, blade);
      sk.bones[iChest].localRotation.premul(_ikQ).normalize();
      if (iNeck >= 0) {
        _ikQ.setAxisAngle(_ikY, -blade);
        sk.bones[iNeck].localRotation.premul(_ikQ).normalize();
      }
      /* A support shoulder protracted in its own socket was tried here,
         both ways round, and the readings said it cost two to three
         centimetres of reach either way -- which was nonsense, and
         turned out to be nonsense: hold.test.js measures a bot in a
         LIVE MATCH, and three runs of one unchanged build returned 20,
         20 and 14 cm. The test pins the subject's pose now. Nothing was
         learnt about the shoulder; it is simply not in. */
      sk.update();
    }

    /* World -> the actor's own frame, which is the frame the bones are
       in.

       THE FIRST VERSION OF THIS SUBTRACTED actor.position AND UNDID
       actor.rotation, AND BOTH HALVES WERE WRONG. A character here is
       driven by a kinematic controller, and Actor.updateMatrix composes
       such an actor from `controller.body.position + visualOffset` and
       `setEuler(0, controller.facing, 0)` -- it never looks at
       actor.rotation at all, because the rigid body's rotation is locked
       so it cannot topple and is therefore always identity. Undoing an
       identity quaternion undoes nothing, so every target was left in
       world orientation while the bones were in the body's, and a man
       facing south reached for a rifle that, as far as his shoulders
       were concerned, was behind him. The face() function twenty lines
       down documents this exact trap; I walked into it anyway by
       reading the getter's name instead of the composer.

       So take the frame from the composer. Recompose the matrix (it is
       otherwise a frame stale, because the engine rebuilds transforms
       after it runs the animators) and invert it: that is correct
       whatever updateMatrix does next, including the per-operator scale,
       which subtract-and-unrotate also silently ignored. */
    actor.updateMatrix();
    _ikInv.copy(actor.matrix).invert();
    var toLocal = function (out, wx, wy, wz) {
      out.set(wx, wy, wz).applyMat4(_ikInv);
      return out;
    };

    // The firing hand: the weapon's origin is its grip.
    toLocal(_ikA, gunA.position.x, gunA.position.y, gunA.position.z);
    /* The support hand: out along the forend, at about half bore
       height, which is where handsFor puts the viewmodel's -- the same
       rule, so the man across the street holds it where you do. */
    var reach = (gunA.muzzleAt != null ? gunA.muzzleAt : 0.42) * 0.62;
    var bore = (gunA.boreAt != null ? gunA.boreAt : 0.05) * 0.42;
    _ikB.set(reach, bore, 0).applyQuat(gunA.rotation);
    toLocal(_ikP, gunA.position.x + _ikB.x, gunA.position.y + _ikB.y,
      gunA.position.z + _ikB.z);
    _ikB.copy(_ikP);

    /* CHOKE UP WHEN THE ARM WILL NOT GO THAT FAR.
     *
       Sixty-two per cent of the way to the muzzle is where a support
       hand belongs on a carbine and nowhere near where it can go on a
       machine gun. Measured: the MG42's forend point is 52 cm ahead of
       its grip, the arm is 50 cm long, and it hangs off a shoulder 20
       more centimetres away again -- so the target was a third of a
       metre outside the reachable annulus. solveIK clamps rather than
       fails, which means it quietly locked the arm straight and left
       the hand in mid-air, and the same thing was happening by 7 cm on
       an MP5 the moment the weapon came up to the eye. Four weapons
       were holding nothing with their support hand and the only reason
       it was not obvious is that a straight arm looks deliberate.

       A person solves this by choking up: the hand goes as far down the
       handguard as the arm reaches and no further. So do that, and
       exactly -- walk the target back along the weapon's own axis to
       the last point inside the arm's reach, which is a quadratic in
       one unknown rather than a fudge factor. The hand stays ON the
       weapon, which is the whole promise, and long guns get held nearer
       the receiver, which is how long guns are held. */
    var shd = sk.worldPosition(iUL, _ikS);
    var armReach = 0.98 * (
      sk.worldPosition(iUL, _ikU).distanceTo(sk.worldPosition(iLL, _ikP))
      + sk.worldPosition(iLL, _ikU).distanceTo(sk.worldPosition(iHL, _ikP)));
    if (_ikB.distanceTo(shd) > armReach) {
      /* The weapon's axis in the actor's frame, taken as the direction
         from grip to the wanted hand rather than re-deriving it, so a
         weapon whose forend point is at zero cannot produce a NaN. */
      _ikU.copy(_ikB).sub(_ikA);
      var span = _ikU.length();
      if (span > 1e-5) {
        _ikU.scale(1 / span);
        // |(grip - shoulder) + t * axis| = armReach, largest root.
        _ikP.copy(_ikA).sub(shd);
        var b = _ikP.dot(_ikU), c = _ikP.lengthSq() - armReach * armReach;
        var disc = b * b - c;
        var t = disc > 0 ? -b + Math.sqrt(disc) : -b;
        t = Math.max(0.06, Math.min(span, t));
        _ikB.copy(_ikA).addScaled(_ikU, t);
      }
    }

    /* Elbows. Without a pole the solver keeps whatever bend the clip
       left, which on a run cycle is behind him -- so both elbows wind
       up pointing backwards and the arms read as broken. The firing
       elbow rides OUT and up as the weapon comes to the shoulder,
       which is the single detail that says "aiming" at a distance; the
       support elbow tucks in and under, because that is what carries
       the weight. */
    sk.worldPosition(iChest >= 0 ? iChest : sk.index('spine'), _ikP);
    var chestY = _ikP.y;
    var poleR = { x: -0.34 - aim * 0.16, y: chestY - 0.10 + aim * 0.20, z: -0.06 };
    var poleL = { x: 0.16, y: chestY - 0.30, z: 0.10 };

    sk.solveIK(iUR, iLR, iHR, _ikA, poleR);
    sk.solveIK(iUL, iLL, iHL, _ikB, poleL);
  }

  /* WHICH WAY A BODY IS POINTING.
     ================================================================
     Setting actor.rotation does NOTHING to a character. The engine
     composes a controller-driven actor's transform from
     controller.facing, because a capsule has its rotation locked so it
     cannot topple and therefore carries no facing information at all
     (see Actor.updateMatrix). So the two lines here that carefully set
     a quaternion every tick were writing to a field nothing reads.

     And controller.facing is only ever advanced by the controller's
     OWN steering, which a teleported body never runs. Which means
     every man in this match has been pointing due north since the
     first frame, whatever direction he was running or shooting in --
     twelve people strafing sideways and firing over their shoulders,
     for the whole of every match. */
  var _upAxis = null;
  function face(actor, yaw) {
    if (!actor) return;
    if (actor.controller) actor.controller.facing = yaw;
    else if (actor.rotation && actor.rotation.setAxisAngle) {
      /* setAxisAngle, not setFromAxisAngle -- there is no such method
         on this Quat, so this branch has been throwing nothing and
         doing nothing since it was written. And the axis is read as
         .x/.y/.z, so an array arrives as three undefineds and yields a
         quaternion of NaNs: a body that reports a perfectly correct
         world position while the GPU throws away every one of its
         triangles. That exact pair of mistakes cost most of a day on
         the multiplayer viewmodel. */
      if (!_upAxis) _upAxis = new W.LE.Vec3(0, 1, 0);
      actor.rotation.setAxisAngle(_upAxis, yaw);
    }
  }

  /* WHERE THE BODY GOES. The capsule's origin is its CENTRE, so a body
     standing on the floor sits half its own height above it -- and this
     was a flat 0.9 for everybody, on operators who run from 1.72m to
     1.92m. The tall ones stood six centimetres into the concrete and
     the short ones floated four above it, which is most of why the men
     in this game do not look like they are standing on anything. */
  function lift(p) {
    var c = p.actor && p.actor.controller;
    return c && c.height ? c.height * 0.5 : 0.9;
  }

  /* animate() is handed a person and a delta and has no match in
     scope, and the stance transitions need the clock. Set once per
     tick by update(), which is the only caller. */
  var M_TIME = 0;
  /* And the tick length, for anything outside update() that has to
     ease a value -- carry() is handed a person and an angle and no
     clock at all. */
  var DT_LAST = 1 / 60;

  function animate(p, dt) {
    var a = p.actor.animator;
    if (!a) return;
    p.actor.controller.autoAnimate = false;

    var last = p._animPos;
    var sp = 0;
    if (!p.alive && p.corpse) { p._animPos = { x: p.corpse.x, z: p.corpse.z }; p._animSpeed = 0; }
    else if (last && dt > 1e-4) {
      sp = Math.hypot(p.pos.x - last.x, p.pos.z - last.z) / dt;
      // A respawn is a jump across the map, not a hundred-metre-per-
      // second dash. Anything past a plausible sprint is teleportation.
      if (sp > 14) sp = 0;
      p._animPos = { x: p.pos.x, z: p.pos.z };
    } else p._animPos = { x: p.pos.x, z: p.pos.z };
    // Smoothed, because a per-frame position delta on a grid-collided
    // body is spiky enough to flicker between two states on a wall.
    p._animSpeed = p._animSpeed == null ? sp
      : p._animSpeed + (sp - p._animSpeed) * Math.min(1, dt * 12);
    var v = p._animSpeed;

    /* THREE STANCES, AND A CYCLE FOR EACH OF THEM.
     *
       This used to be four clips for every state a body could be in,
       so a crouched man ran the standing walk with the camera lowered
       and a man flat on the floor ran it as well. There is now a
       locomotion set per stance -- stand, crouch, prone -- and the
       transitions between the stances are their own non-looping clips
       that have to finish before the cycle underneath them takes over.

       DROP and STANDUP are timed rather than flagged: the match knows
       when the stance changed (proneAt), so the clip runs for its own
       length from that moment and nothing has to remember to clear
       a flag. */
    /* WHICH CYCLE IS CHOSEN BY THE CYCLES, not by thresholds written
       against this game's movement speeds. Those speeds are not human
       ones -- 4.6 m/s is a sprint, not a walk -- so a threshold list
       tuned to them put a man crossing a room into the WALK clip at
       barely two metres a second of leg speed against 4.6 of floor, and
       his feet skated the difference. Every locomotion clip now states
       how far one cycle carries the body, so the right clip is simply
       the one whose own travelling speed is nearest and the right rate
       is the ratio. See gaitRate and AnimationClip.stride. */
    var want;
    var sinceProne = M_TIME - (p.proneAt || -99);
    if (!p.alive && p.corpse) want = p.corpse.face ? 'deathFace' : 'deathBack';
    else if (!p.alive) want = 'idle';
    else if (p.sliding) want = 'slide';
    else if (!p.grounded && !p.prone) want = 'jump';
    else if (p.prone) {
      if (sinceProne < 0.42) want = 'drop';
      else want = v > 0.18 ? 'crawl' : 'proneIdle';
    } else if (sinceProne < 0.80 && p._wasProne) want = 'standUp';
    else if (p.crouching) {
      want = v > 0.30 ? gaitPick(a, ['crouchWalk', 'crouchRun'], v) : 'crouchIdle';
    /* A man who is AIMING is not sprinting, whatever his speed says.
       Rewriting this to pick by stride dropped the `p.sprinting` gate the
       old thresholds carried, so a bot crossing a room with his rifle
       shouldered played the sprint cycle -- fifteen degrees of trunk
       lean and twelve of chest twist -- and his support hand lost three
       centimetres of reach down the handguard. hold.test.js measured it:
       17.1 cm to 14.1. */
    } else if (v > 0.35) {
      want = gaitPick(a, (p.sprinting && !p.aiming) ? ['walk', 'run', 'sprint']
        : ['walk', 'run'], v);
    }
    else want = 'idle';
    p._wasProne = !!p.prone || want === 'standUp';

    if (want !== p._animState) {
      p._animState = want;
      /* A transition snaps in; a cycle eases. */
      var quick = want === 'jump' || want === 'slide' || want === 'drop';
      a.play(want, quick ? 0.06 : (want === 'standUp' ? 0.10 : 0.16));
    }
    var cyc = a.clips.get(want);
    if (cyc && cyc.stride) a.speed = W.LE.gaitRate(cyc, v);
    else if (want === 'crawl') a.speed = Math.max(0.5, Math.min(1.8, v / 1.1));
    else a.speed = 1;
  }

  /* The cycle whose own travelling speed is closest, compared in log
     terms: a clip asked for half speed and one asked for double are
     equally wrong, and a linear comparison says otherwise. */
  function gaitPick(a, names, v) {
    var best = names[0], bestErr = Infinity;
    for (var i = 0; i < names.length; i++) {
      var c = a.clips.get(names[i]);
      if (!c || !c.stride) continue;
      var err = Math.abs(Math.log(Math.max(v, 0.2) / (c.stride / c.duration)));
      if (err < bestErr) { bestErr = err; best = names[i]; }
    }
    return best;
  }

  /* Pose every body from a tape frame instead of from the simulation.
     This is the whole of what a replay does to the world: the same
     actors, the same animator, driven by what was recorded rather than
     by what is happening. Speed is measured from the tape the same way
     animate measures it from the simulation, because a replay of men
     sliding about in the bind pose is what the live game looked like
     before animate existed and it looked like a bug. */
  function pose(M, list, dt) {
    if (!list) return;
    for (var i = 0; i < M.people.length && i < list.length; i++) {
      var p = M.people[i], e = list[i];
      if (!p.actor || !p.actor.controller) continue;
      if (!e.alive) {
        /* THE VICTIM FALLS IN HIS OWN KILL CAM.

           A dead entry used to be sent sixty metres under the map, so at
           the moment of the kill -- the moment the kill cam exists to
           show -- the man who was shot simply ceased to be there. A body
           seen alive on this tape and dead on the next frame is posed
           where it stood, playing the same fall the live game plays
           (face down if the round came from behind); only a man who was
           already dead before the tape starts is kept out of sight. */
        if (p._rpAlive && p._rpLast && p.actor.animator) {
          p._rpDead = p._rpLast;
          var fc = p.corpse ? !!p.corpse.face : false;
          p.actor.controller.autoAnimate = false;
          p.actor.animator.play(fc ? 'deathFace' : 'deathBack', 0.08);
          p.actor.animator.speed = 1;
          p._rpState = 'dead';
        }
        p._rpAlive = false;
        if (p._armShown) showArm(p._armShown, false);
        if (p._rpDead) {
          p.actor.controller.teleport([p._rpDead.x, p._rpDead.y + lift(p), p._rpDead.z]);
          face(p.actor, p._rpDead.yaw);
        } else {
          p.actor.controller.teleport([e.x, -60, e.z]);
        }
        continue;
      }
      if (p._rpState === 'dead') p._rpState = null;
      p._rpAlive = true; p._rpDead = null;
      p._rpLast = { x: e.x, y: e.y, z: e.z, yaw: e.yaw };
      p.actor.controller.teleport([e.x, e.y + lift(p), e.z]);
      face(p.actor, e.yaw);
      /* The replay's weapons come off the tape too, or a kill cam shows
         everybody holding their guns where they are standing NOW. */
      var keep = { x: p.pos.x, y: p.pos.y, z: p.pos.z };
      var keepC = p.crouching, keepP = p.prone, keepA = p.aiming;
      p.pos.x = e.x; p.pos.y = e.y; p.pos.z = e.z;
      p.crouching = e.crouching; p.prone = e.prone; p.aiming = e.aiming;
      carry(M, p, e.yaw, e.pitch, e.sprinting, e.alive);
      p.pos.x = keep.x; p.pos.y = keep.y; p.pos.z = keep.z;
      p.crouching = keepC; p.prone = keepP; p.aiming = keepA;
      var a = p.actor.animator;
      if (!a) continue;
      p.actor.controller.autoAnimate = false;
      var last = p._rpPos, sp = 0;
      if (last && dt > 1e-4) {
        sp = Math.hypot(e.x - last.x, e.z - last.z) / dt;
        if (sp > 14) sp = 0;
      }
      p._rpPos = { x: e.x, z: e.z };
      p._rpSpeed = p._rpSpeed == null ? sp : p._rpSpeed + (sp - p._rpSpeed) * Math.min(1, dt * 12);
      var v = p._rpSpeed;
      /* The same choice the live game makes, from the same clips: a
         replay used to pick by fixed speed thresholds and knew nothing of
         crouch or prone, so a man who crawled up to the shot stood up and
         walked in his own kill cam, feet skating at the old speeds. */
      var want;
      if (e.prone) want = v > 0.18 ? 'crawl' : 'proneIdle';
      else if (e.crouching) want = v > 0.30 ? gaitPick(a, ['crouchWalk', 'crouchRun'], v) : 'crouchIdle';
      else if (v > 0.35) want = gaitPick(a, (e.sprinting && !e.aiming) ? ['walk', 'run', 'sprint'] : ['walk', 'run'], v);
      else want = 'idle';
      if (!a.clips.get(want)) want = v > 0.35 ? 'walk' : 'idle';
      if (want !== p._rpState) { p._rpState = want; a.play(want, 0.16); }
      var rc = a.clips.get(want);
      if (rc && rc.stride) a.speed = W.LE.gaitRate(rc, v);
      else if (want === 'crawl') a.speed = Math.max(0.5, Math.min(1.8, v / 1.1));
      else a.speed = 1;
    }
  }

  /* Handing the world back. The live animator remembers what it last
     played, so without this everybody keeps whatever the replay left
     them doing until their speed happens to cross a threshold. */
  function unpose(M) {
    lodReset(M);
    for (var i = 0; i < M.people.length; i++) {
      var p = M.people[i];
      p._rpPos = null; p._rpSpeed = null; p._rpState = null;
      p._rpAlive = false; p._rpDead = null; p._rpLast = null;
      p._animState = null; p._animPos = null; p._animSpeed = null;
    }
  }

  /* Turn towards a heading, at a rate. Snapping to face a target is
     what makes a bot feel like a turret; a rate makes it feel like
     somebody who has just noticed you. */
  /* Returns the error REMAINING after the turn, not the error before
     it. Before-the-turn was what gated firing, and it let a bot shoot
     while still eight degrees off -- four metres wide at thirty. */
  function turnTo(p, wantYaw, rate, dt) {
    var d = wantYaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var step = rate * dt;
    var applied = Math.max(-step, Math.min(step, d));
    p.yaw += applied;
    return Math.abs(d - applied);
  }

  function yawTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

  /* ================================================================
     THE BOT
     ================================================================
     Four states. A bot with fourteen states does something
     inexplicable once a match and ruins it. */

  /* ================================================================
     WHAT BEING HELD MEANS
     ================================================================
     "You were allowed to move around the lever while the animation was
     broken, still saying you were cranking it."

     So a lock is not a flag that a bit of UI reads. It is this, and it
     is applied in the one place both a bot and the player go through:

       the feet stop        no walk, no sprint, no slide, no jump
       the hands are busy   no firing, no reload, no grenade
       the body turns       to the thing being worked on, which is how
                            the man ends up looking at the tank instead
                            of at wherever he happened to be aiming

     Returns true when the man is held, so the callers can stop early
     rather than carefully zeroing eleven fields each. */
  function busyHold(M, p, dt) {
    if (!p.busy) return false;
    p.vel.x = 0; p.vel.z = 0;
    p.sprinting = false; p.aiming = false;
    p._wantSlide = false; p.sliding = false;
    p._heldTrigger = false;
    var f = p.busy.faceAt;
    if (f) {
      var want = Math.atan2(f[0] - p.pos.x, f[2] - p.pos.z);
      var d = want - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 7);
      p.pitch += (0.12 - p.pitch) * Math.min(1, dt * 5);
    }
    return true;
  }

  function botThink(M, p, dt, rand, emit) {
    /* A held bot is held. Without this the one cutting the lock walks
       off to shoot at somebody while the progress bar fills. */
    if (busyHold(M, p, dt)) return;
    var ai = p.ai, sk = p.skill || MP_DATA.BOT_SKILL[1];
    var w = gun(p);

    /* ---- see ---- */
    if (M.time - ai.sawAt > 0.18) {
      ai.sawAt = M.time;
      if (M.stats) M.stats.scans++;
      var best = null, bd = 1e9;
      for (var i = 0; i < M.people.length; i++) {
        var q = M.people[i];
        if (q.team === p.team || !q.alive) continue;
        var d = Math.hypot(q.pos.x - p.pos.x, q.pos.z - p.pos.z);
        /* How far away a bot notices you. Capped, and capped hard.
           Uncapped at far * 1.8 + 12 an assault rifle noticed a man a
           hundred metres off, so on every map everybody could see
           everybody and the whole twelve stood still shooting across it
           -- eighty-four per cent of all ticks were spent engaging and
           the fight never moved. */
        if (d > Math.min(w.far * 1.5 + 8, 56)) continue;
        if (!losClear(M, eyeOf(p), { x: q.pos.x, y: q.pos.y + 1.0, z: q.pos.z })) continue;
        if (d < bd) { bd = d; best = q; }
      }
      if (best) {
        if (M.stats) { M.stats.seen++; if (ai.target !== best) M.stats.acquired++; }
        if (ai.target !== best) ai.reactAt = M.time + sk.react * (0.6 + rand() * 0.8);
        ai.target = best;
        ai.lastSeen = { x: best.pos.x, y: best.pos.y, z: best.pos.z };
        ai.lostAt = M.time;
      } else if (ai.target && M.time - ai.lostAt > 1.6) {
        ai.target = null;
      }
    }

    var t = ai.target;
    /* YOU PLAY A MODE WITH NO RESPAWNS DIFFERENTLY.
     *
       The bots did not. They walked into the middle of Helipad twelve
       at a time and one side was wiped inside twenty seconds, every
       round, for eight rounds -- and the bomb carrier reached the site
       with two and a quarter of the three seconds he needed, and died
       holding it, every single time. Nothing was broken. They were
       simply playing Search and Destroy as though they had another life
       coming, which is the one thing that mode is about not having.

       So when there is no respawn they break off much earlier and they
       do not close the distance. It is the same four states; it is the
       thresholds that change, which is also the honest difference
       between how a person plays the two modes. */
    /* And in the back half of a round the clock becomes the enemy. An
       attacking side still being careful with twenty seconds left is an
       attacking side that has already lost the round; real players
       commit, and so do these. Without it, whether a bomb was ever
       planted on a given map came down to the seed. */
    var attacking = M.mode.bomb && M.bomb && p.team === M.bomb.attackers && !M.bomb.planted;
    /* Twenty-five seconds, or down to the last two men.
     *
       This was fifty-five, and fifty-five never happened: rounds end by
       elimination somewhere between thirty and fifty seconds, so the
       rule that was meant to make attackers commit ran in no round of
       any match. The tick counts across the change were byte for byte
       identical, which is always the same story -- the code was not
       being reached. */
    var alive = (M.aliveCount && M.aliveCount[p.team]) || 6;
    /* Fifteen seconds, not twenty-five: measured, rounds on these maps
       are decided between nineteen and thirty, so twenty-five was most
       of the way to being another rule that never ran. */
    var pressing = attacking && (M.roundTime > 15 || alive <= 2);
    var careful = M.mode.bomb && !pressing;
    var hurtBadly = p.hp < (careful ? 62 : 38);
    var td = t ? Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z) : 1e9;
    var inRange = t && td < w.far * 1.25 + 6;
    /* THE MAN WITH THE BOMB DOES NOT STOP TO FIGHT.
     *
       He stopped for everybody he saw, which on Demolition -- small,
       and with sightlines through holes in three floors -- meant he saw
       somebody within ten metres of leaving the spawn and never moved
       again. Six rounds, no plant. A carrier keeps walking unless
       somebody is close enough to be the more urgent problem. */
    var carrying = M.bomb && !M.bomb.planted && M.bomb.carrier === p.id;
    if (carrying && !hurtBadly && td > 13) inRange = false;
    ai.state = (t && inRange && M.time >= (ai.reactAt || 0))
      ? (hurtBadly ? 'break' : 'engage') : 'advance';

    if (M.stats) M.stats[ai.state === 'engage' ? 'engageTicks'
      : ai.state === 'break' ? 'breakTicks' : 'advanceTicks']++;

    if (ai.state === 'engage') {
      var d2 = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
      /* IT BRINGS THE GUN UP. How readily depends on the difficulty --
         a Veteran is on the sights for anything past a room's width, a
         Recruit mostly is not -- and past twelve metres everybody who
         is going to aim, does. It is not free: the ads flag is what
         narrows its cone through coneOf, so a bot that aims is a bot
         that hits, which is what the difficulty is buying. */
      p.aiming = (sk.ads || 0) > 0.2 && (d2 > 12 * (1.2 - (sk.ads || 0)) || (sk.ads || 0) > 0.9);
      var off = turnTo(p, yawTo(p.pos, t.pos), 5.0 + sk.aim * 5.0, dt);
      /* Pulled back down against its own recoil, as well as it can --
         which is what its skill actually buys it. */
      var want = Math.atan2((p.pos.y + EYE) - (t.pos.y + aimYOf(t)), Math.max(0.5, d2));
      p.pitch = want - (p.kickUp || 0) * (1 - sk.aim * 0.85);
      /* Strafe rather than stand. Changed at intervals, not per frame,
         or the body vibrates on the spot. */
      ai.jitter -= dt;
      if (ai.jitter <= 0) { ai.jitter = 0.5 + rand() * 1.1; ai.strafe = rand() < 0.5 ? -1 : 1; }
      var side = RIGHT(p.yaw);
      /* Close the distance in deathmatch; hold it when a death is the
         end of your round. */
      var hold = careful ? 1.35 : 0.9;
      var want = d2 > w.near * hold ? 1 : (d2 < w.near * (hold * 0.45) ? -1 : 0);
      /* AND IT GOES DOWN -- BUT IT DOES NOT STAY DOWN.
       *
         Every rule written for the player is a rule for everybody, and
         crouching is a real one: a quarter off the cone and a much
         smaller target. A bot that never used it was playing a
         different game from the one the player is in.

         The first version crouched whenever a bot held its range,
         which in practice was most of every engagement -- and measured
         over four full matches that took the hit rate across the whole
         lobby from 15.8 per cent to 13.7 and turned two of the four
         maps into walkovers, because longer fights let whichever side
         is ahead stay ahead. Two people permanently behind cover at
         each other is also not what a firefight looks like.

         So it is a decision on a timer, taken on the same beat as the
         strafe: down for a burst, up to reposition, and the better
         shots stay down longer because they are getting more out of
         it. Measured back at 16.4 per cent, which is where it was. */
      if (!(W.MP_DEBUG && W.MP_DEBUG.noBotCrouch) && want === 0 && d2 > 7) {
        if (M.time >= (ai.duckAt || 0)) {
          var chance = 0.20 + (sk.ads || 0) * 0.35;
          ai.duck = rand() < chance;
          ai.duckAt = M.time + 0.9 + rand() * 1.4;
        }
        p.crouching = !!ai.duck;
      } else p.crouching = false;
      var sp = 4.4 * w.move;
      moveBy(M, p,
        Math.sin(p.yaw) * want * sp * 0.75 + side.x * ai.strafe * sp * 0.6,
        Math.cos(p.yaw) * want * sp * 0.75 + side.z * ai.strafe * sp * 0.6, dt);
      if (off < 0.035 && M.time >= p.nextShot) fire(M, p, rand, emit);
      return;
    }

    p.aiming = false;
    p.crouching = false;

    if (ai.state === 'break') {
      /* Hurt: back off the way you came and let it regenerate. Bots
         that fight to the death make every trade a coin flip. */
      var away = yawTo(t.pos, p.pos);
      turnTo(p, away, 6.0, dt);
      moveBy(M, p, Math.sin(away) * 5.2, Math.cos(away) * 5.2, dt);
      if (M.time - ai.lostAt > 2.5 || p.hp > (careful ? 85 : 70)) ai.state = 'advance';
      return;
    }

    /* ---- advance ---- */
    if (!ai.goal || M.time - ai.goalAt > 9 || dist2(p.pos, ai.goal) < 3.5) {
      ai.goal = pickGoal(M, p, rand);
      ai.goalAt = M.time;
      ai.path = null;
    }
    var step = steer(M, p, ai.goal);
    if (step) {
      var yaw = yawTo(p.pos, step);
      turnTo(p, yaw, 4.5, dt);
      p.pitch *= 0.85;
      /* THE MOVEMENT SYSTEM, by difficulty. A Recruit walks everywhere,
         which is most of what makes an easy bot read as easy before a
         shot is fired; a Veteran sprints between cover. Sprinting costs
         it accuracy through coneOf exactly as it costs a player, so a
         bot that runs in is a bot that misses on the way. */
      var far = ai.goal ? dist2(p.pos, ai.goal) : 0;
      p.sprinting = (sk.move || 0) > 0.3 && far > 9 && !t;
      var run = (p.sprinting ? 6.6 : 5.4) * gun(p).move;
      moveBy(M, p, Math.sin(p.yaw) * run, Math.cos(p.yaw) * run, dt);
      /* Walking and shooting: if somebody is roughly in front of you
         while you are advancing, fire anyway. Wide cone, because you
         are moving and not aiming, which is exactly right. */
      if (t && td < w.far && M.time >= p.nextShot) {
        var want = yawTo(p.pos, t.pos), off2 = want - p.yaw;
        while (off2 > Math.PI) off2 -= Math.PI * 2;
        while (off2 < -Math.PI) off2 += Math.PI * 2;
        if (Math.abs(off2) < 0.20) fire(M, p, rand, emit);
      }
    }
  }

  function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  /* Where a bot is trying to get to. In Search and Destroy that is the
     bomb, the site, or the man carrying it. In Team Deathmatch it is
     the middle of a lane in the other half, which is the honest answer
     to "where is the fight" on a three-lane map. */
  function pickGoal(M, p, rand) {
    var g = rawGoal(M, p, rand);
    return navSnap(M.nav, g.x, g.z) || g;
  }

  function rawGoal(M, p, rand) {
    if (M.mode.bomb && M.bomb) {
      var att = M.bomb.attackers === p.team;
      if (M.bomb.planted) {
        var s = M.bomb.site;
        return { x: s.at[0] + (rand() - 0.5) * 6, z: s.at[2] + (rand() - 0.5) * 6 };
      }
      if (att && M.bomb.carrier === p.id) {
        var site = M.map.sites[M.bomb.want];
        return { x: site.at[0], z: site.at[2] };
      }
      /* Late in the round everybody on the attacking side goes to the
         site, carrier or not: a plant needs somebody standing on it and
         there is no time left to be clever about getting there. */
      if (att && (M.roundTime > 15 || (M.aliveCount && M.aliveCount[p.team] <= 2))) {
        var sl = M.map.sites[M.bomb.want];
        return { x: sl.at[0] + (rand() - 0.5) * 7, z: sl.at[2] + (rand() - 0.5) * 7 };
      }
      /* THE REST OF THE ATTACK GOES TO THE SITE, spread around it.
       *
         They used to escort the carrier at plus or minus twenty-two
         metres, which was meant to keep him company and instead put the
         whole side in a loose cloud that was nowhere in particular.
         Measured on Town: never more than ONE attacker within reach of
         a site in a whole nine-round match, and the plant stalling at
         1.47 seconds of the 2.8 it needs.

         Going to the site is also going with the carrier -- that is
         where he is headed -- and it means that when he dies somebody
         else is already standing on it. */
      if (att) {
        var sd = M.map.sites[M.bomb.want];
        return { x: sd.at[0] + (rand() - 0.5) * 13, z: sd.at[2] + (rand() - 0.5) * 13 };
      }
      var s2 = M.map.sites[att ? M.bomb.want
        : Math.min(M.map.sites.length - 1, Math.floor(rand() * M.map.sites.length))];
      return { x: s2.at[0] + (rand() - 0.5) * 10, z: s2.at[2] + (rand() - 0.5) * 10 };
    }
    var lane = M.map.lanes[Math.floor(rand() * M.map.lanes.length) % M.map.lanes.length];
    var toward = p.team === 'a' ? 1 : -1;
    return { x: lane.x + (rand() - 0.5) * 12, z: toward * (6 + rand() * 24) };
  }

  /* Walk round what is in the way. The direct line first, because it is
     the common case and costs one lookup; the grid only when it is not
     clear. Recomputed on a timer rather than every frame, or twelve
     bodies is twelve A* searches sixty times a second. */
  function steer(M, p, goal) {
    var ai = p.ai;
    if (navClear(M.nav, p.pos, goal)) { ai.path = null; return goal; }
    var stale = !ai.path || M.time - ai.pathAt > 1.1;
    /* ONE SEARCH A TICK, BETWEEN ALL OF THEM.
       Each bot repaths on its own 1.1 second timer, so about ten
       searches a second across eleven of them -- which is nothing
       spread out and a stall when three of them land on the same
       frame. Measured, the match tick sits at 0.30ms and jumps to
       33.7 with no kill, no spawn and nothing else happening in it,
       four times in ninety frames.

       A bot whose search is deferred keeps walking the path it already
       has for another sixteen milliseconds, which is not a thing
       anybody can see. At sixty frames a second the budget offers
       sixty searches where ten are wanted, so nobody waits long. */
    if (stale && M._pathBudget <= 0 && ai.path && ai.path.length) stale = false;
    if (stale) {
      if (M.stats) M.stats.paths++;
      M._pathBudget--;
      var _t0 = W.performance ? W.performance.now() : 0;
      ai.path = navPath(M.nav, p.pos, goal, M.stats);
      if (W.performance) { M._pathMs += W.performance.now() - _t0; M._pathN++; }
      ai.pathAt = M.time; ai.pathIdx = 0;
      if (!ai.path) {
        if (M.stats) M.stats.pathFail++;
        /* Somewhere it cannot get to. Choose again next tick rather
           than asking the same impossible question every second for the
           rest of the match. */
        ai.goal = null; ai.goalAt = -99;
      }
    }
    var path = ai.path;
    if (!path || !path.length) return goal;
    var wp = path[Math.min(ai.pathIdx, path.length - 1)];
    if (dist2(p.pos, { x: wp[0], z: wp[2] }) < 0.9) {
      ai.pathIdx = Math.min(ai.pathIdx + 1, path.length - 1);
      wp = path[ai.pathIdx];
    }
    return { x: wp[0], z: wp[2] };
  }

  /* ================================================================
     THE TWO MODES
     ================================================================ */

  function armRound(M) {
    /* Sides swap at the halfway point, which is what stops Search and
       Destroy being a map you only ever attack or only ever defend. */
    var half = Math.ceil(M.mode.score / 2);
    var swapped = (M.score.a + M.score.b) >= half;
    var attackers = swapped ? 'b' : 'a';
    /* THREE SITES NOW, so the round number cannot just alternate. Walk
       them in order: with three sites and six rounds a side, each one
       comes up twice. */
    var nSites = (M.map.sites && M.map.sites.length) || 1;
    var want = M.round % nSites;
    var site = M.map.sites[want];
    /* Every tank shut, every lock back on, nobody still held by last
       round's job. A round that starts with a door standing open from
       the previous one is a round somebody can finish in six seconds. */
    for (var si = 0; si < nSites; si++) showTank(M.map.sites[si], false);
    releaseAll(M);
    /* And everything that fell last round goes back up. Round two on
       a site that has already collapsed is a different map from round
       one, and neither side chose it. */
    resetCollapses(M);
    /* The bomb goes to whoever spawned nearest the site they are going
       to, not to whoever happens to be first in the list. On Town --
       the biggest of the four -- the first attacker was routinely the
       one furthest from the objective, and across six rounds the bomb
       was never carried to a site once. */
    var carriers = M.people.filter(function (p) { return p.team === attackers; })
      .sort(function (x, y) {
        return Math.hypot(x.pos.x - site.at[0], x.pos.z - site.at[2])
          - Math.hypot(y.pos.x - site.at[0], y.pos.z - site.at[2]);
      });
    M.bomb = {
      attackers: attackers, defenders: attackers === 'a' ? 'b' : 'a',
      carrier: carriers.length ? carriers[0].id : null,
      want: want,
      planted: false, plantAt: 0, progress: 0, site: null, defuse: 0, switched: false,
      lastAt: 0,
    };
    M.roundTime = 0;
  }

  /* ================================================================
     THE TANK, THE LOCK AND FOUR WIRES
     ================================================================
     A defuse used to be six seconds of standing on a coordinate. This
     is what was asked for instead, and the shape of it is the point:
     it takes twenty seconds, you cannot move for any of them, and at
     the end of it you have to be right about something.

       0.0 - 7.0    WIRE CUTTERS on the padlock. The lock goes, the
                    doors swing.
       7.0 - 20.0   INSIDE, working on the bomb.
       20.0         FOUR WIRES. One of them is the one.
       wrong        the failsafe arms and you have TEN SECONDS to pick
                    again from what is left.

     And the other side can undo it. A tank that has been cut open, with
     nobody in it, can be BLOWTORCHED shut again: doors back together,
     lock fused, and the twenty seconds start from nothing.

     Both jobs hold the man doing them still -- see busyTick. That was
     the whole complaint about the power lever in the other game: an
     animation you could walk away from while it carried on saying you
     were doing it. */
  var SND = {
    lock: 7.0,          // wire cutters on the padlock
    inside: 13.0,       // and then in the tank, on the bomb
    failsafe: 10.0,     // after a wrong wire
    weld: 8.0,          // the blowtorch, to put it back
    hold: 4.0,          // how long progress survives its man being killed
    wires: ['red', 'blue', 'green', 'yellow'],
  };

  /* Everybody of one side who is standing at the site, nearest first. */
  function atSite(M, team, site) {
    return M.people.filter(function (q) {
      return q.team === team && q.alive
        && Math.hypot(q.pos.x - site.at[0], q.pos.z - site.at[2]) < site.r;
    }).sort(function (x, y) {
      return Math.hypot(x.pos.x - site.at[0], x.pos.z - site.at[2])
        - Math.hypot(y.pos.x - site.at[0], y.pos.z - site.at[2]);
    });
  }

  /* THE LOCK ITSELF. One man at a time is the worker, he cannot move,
     and he is let go the moment the job stops being his -- finished,
     killed, welded shut under him, or the round over. Nothing else in
     the match is allowed to set p.busy, so there is exactly one place
     that can leave somebody stuck. */
  function setBusy(M, p, kind, site) {
    if (!p) return;
    p.busy = { kind: kind, site: site.id, at: M.time,
      faceAt: (site.tank && site.tank.at) || site.at };
  }
  function clearBusy(p) { if (p) p.busy = null; }
  function releaseAll(M) {
    for (var i = 0; i < M.people.length; i++) clearBusy(M.people[i]);
  }

  function shuffledWires(rand) {
    var w = SND.wires.slice();
    for (var i = w.length - 1; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var t = w[i]; w[i] = w[j]; w[j] = t;
    }
    return w;
  }

  /* Open the doors and take the padlock off, or put both back. Guarded,
     because a map built before the tanks existed has sites with no tank
     on them and the mode still has to run. */
  function showTank(site, open) {
    if (site && site.tank && site.tank.setOpen) site.tank.setOpen(open ? 1 : 0);
  }

  /* ================================================================
     DOORS THAT OPEN BECAUSE SOMEBODY IS THERE
     ================================================================
     "make an animation for opening and closing the door."

     No key and no prompt: a door in a shooter that has to be USED is a
     door that gets you killed standing at it. Anybody alive within
     reach swings it, and it falls shut behind them.

     Rate, not teleport. Three quarters of a second to swing, which is
     fast enough not to be an obstacle and slow enough to be seen, and
     the same rate shut so the two read as one mechanism.

     DISTANCE SQUARED, and only against the people who could plausibly
     be near it. Twelve people against a few dozen doors every tick is
     nothing, but it is nothing that happens sixty times a second, so
     the cheap test comes first. */
  var DOOR_RATE = 1 / 0.75;

  function updateDoors(M, dt) {
    var doors = M.map && M.map.doors;
    if (!doors || !doors.length) return;
    for (var i = 0; i < doors.length; i++) {
      var d = doors[i], near = false, r2 = d.reach * d.reach;
      for (var j = 0; j < M.people.length; j++) {
        var p = M.people[j];
        if (!p.alive) continue;
        /* AND ON THE SAME FLOOR AS IT. Doors know what storey they
           are on now (door() takes a base, for the three floors of
           rooms in Demolition's standing wing), so a plan-view test
           alone has a man on the ground opening every door in the
           building above his head. Two and a half metres of slack,
           which covers a man on a stair halfway through a doorway and
           excludes the floor above. */
        var dx = p.pos.x - d.at[0], dz = p.pos.z - d.at[2];
        if (Math.abs(p.pos.y - d.at[1]) > 2.5) continue;
        if (dx * dx + dz * dz < r2) { near = true; break; }
      }
      var want = near ? 1 : 0;
      var cur = d.open;
      if (cur === want) continue;
      var step = dt * DOOR_RATE;
      d.setOpen(want > cur ? Math.min(want, cur + step) : Math.max(want, cur - step));
    }
  }

  /* ================================================================
     PARTS OF THE SITE COME DOWN
     ================================================================
     "you can actually go on top of the giant crane although you'll
     have to be very careful as every once in a while, parts of the
     construction area will collapse."

     Demolition declares six pieces that can fall -- see `collapses`
     at the bottom of buildDemolition. The map only says WHAT there is
     to drop; this is the machine that decides when, gives you notice,
     drops it and kills whoever stayed.

     One piece at a time, in four states:

       wait     nothing, for somewhere between one and two GAPs
       warn     it shakes, groans and sheds dust for its own `warn`,
                which is between one and three seconds
       fall     it drops its full distance in FALL, accelerating the
                way a falling thing does
       down     it stays where it landed until the round resets

     THE WARNING IS THE WHOLE MECHANIC. A slab that arrives with no
     notice is a random death and the map becomes a coin toss you
     cannot play around. One that groans over your head for two and a
     half seconds first is a place you CHOSE to still be standing in,
     which is the only version of this worth having in a game where
     rounds are won and lost on one life.

     AND IT KILLS ON LANDING, NOT DURING. Testing the footprint every
     frame of the fall kills a man standing under a slab that is still
     six metres above him -- which makes the warning worthless, since
     running out during the fall would not save him. Testing it only
     on the frame it lands means the two and a half seconds are real.

     EVERY ROUND PUTS IT BACK. armRound calls resetCollapses, so the
     second round is not fought over a site that has already fallen
     down and the third is not fought on bare ground. */
  var COLLAPSE_GAP = 26;        // seconds of quiet between one and the next
  var COLLAPSE_FALL = 1.15;     // and how long the drop itself takes
  /* And the quiet at the start of a round. The first thirty seconds are
     the walk out of spawn; nobody is under anything yet and a collapse
     then is a death nobody could have played around. */
  var COLLAPSE_OPEN = 18;

  /* WHERE EACH PIECE STARTED, taken the first time it is asked for
     and not at build time. An actor composes its matrix from its body
     when it has one, and reading positions off a map the instant it
     is built reads them before anything has settled. */
  function collapseHome(c) {
    if (!c.home) {
      c.home = c.parts.map(function (a) {
        return (a && a.position) ? [a.position.x, a.position.y, a.position.z] : null;
      });
    }
    return c.home;
  }

  /* setPosition, never position.set. An actor with no body composes
     its matrix once and returns the cache for ever after; an actor
     with one needs the body moved or the collision stays where the
     geometry used to be. Both are the setter's job. */
  function collapseMove(c, dy) {
    var h = collapseHome(c);
    for (var i = 0; i < c.parts.length; i++) {
      var a = c.parts[i], p = h[i];
      if (!a || !p || !a.setPosition) continue;
      a.setPosition([p[0], p[1] + dy, p[2]]);
    }
  }

  /* THE HEAP IT LEAVES BEHIND. The map builds it at its resting place
     but eight metres under the world; this lifts it into position on
     the frame the piece lands and buries it again when the round
     resets. A collapse with no rubble is a thing that VANISHES, which
     reads as a bug and not as a building coming down -- and the heap
     is the cover the rest of the round gets fought from. */
  var DEBRIS_LIFT = 8;

  function collapseShow(c, up) {
    if (!c.debris || !c.debris.length) return;
    if (!c.rubbleHome) {
      c.rubbleHome = c.debris.map(function (a) {
        return (a && a.position) ? [a.position.x, a.position.y, a.position.z] : null;
      });
    }
    for (var i = 0; i < c.debris.length; i++) {
      var a = c.debris[i], p = c.rubbleHome[i];
      if (!a || !p || !a.setPosition) continue;
      a.setPosition([p[0], p[1] + (up ? DEBRIS_LIFT : 0), p[2]]);
    }
  }

  function collapseDust(M, c, n) {
    if (!M.game || !M.game.particles || !M.game.particles.dust) return;
    try {
      M.game.particles.dust([c.at[0], c.at[1] + 0.6, c.at[2]],
        { count: n, size: 1.6, spread: c.r, gravity: 0.4 });
    } catch (e) { /* an effect is never worth a frame */ }
  }

  function resetCollapses(M) {
    var list = (M.map && M.map.collapses) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].rubbleHome) collapseShow(list[i], false);
      if (!list[i].home) continue;          // never moved, nothing to put back
      collapseMove(list[i], 0);
      list[i].fallen = false;
    }
    /* AND THE CLOCK GOES BACK TOO, not just the phase. It was left at
       whatever it had counted down to, which on a round that ended
       moments before one was due is zero -- so round two opened with a
       slab coming down on the first tick, while both sides were still
       in spawn. Every round gets the same quiet opening the first one
       had. */
    if (M._collapse) {
      M._collapse.phase = 'wait'; M._collapse.cur = -1; M._collapse.t = 0;
      M._collapse.left = COLLAPSE_OPEN;
    }
  }

  function updateCollapse(M, dt, emit, rand) {
    var list = (M.map && M.map.collapses) || [];
    if (!list.length) return;
    if (!M._collapse) {
        M._collapse = { phase: 'wait', left: COLLAPSE_OPEN + rand() * COLLAPSE_GAP,
        cur: -1, t: 0, count: 0 };
    }
    var S = M._collapse;
    S.t += dt;

    if (S.phase === 'wait') {
      S.left -= dt;
      if (S.left > 0) return;
      var up = [];
      for (var i = 0; i < list.length; i++) if (!list[i].fallen) up.push(i);
      /* Everything is already down. Wait for the round rather than
         dropping the same slab twice. */
      if (!up.length) { S.left = 10; return; }
      S.cur = up[Math.min(up.length - 1, Math.floor(rand() * up.length))];
      S.phase = 'warn'; S.t = 0;
      var c0 = list[S.cur];
      var evK = { t: M.time, kind: 'creak', at: c0.at.slice(), r: c0.r,
        warn: c0.warn, what: c0.name };
      M.events.push(evK); emit(evK);
      return;
    }

    var c = list[S.cur];
    if (!c) { S.phase = 'wait'; S.left = COLLAPSE_GAP; return; }

    if (S.phase === 'warn') {
      /* Three centimetres, fast. Enough to read from underneath as
         something about to let go, and small enough that a man
         standing on top of it is not shaken off it. */
      collapseMove(c, 0.03 * Math.sin(M.time * 34));
      if (rand() < dt * 9) collapseDust(M, c, 4);
      if (S.t < c.warn) return;
      S.phase = 'fall'; S.t = 0;
      return;
    }

    if (S.phase !== 'fall') return;
    var u = S.t / COLLAPSE_FALL;
    if (u > 1) u = 1;
    collapseMove(c, -c.drop * u * u);
    if (u < 1) return;

    /* It has landed. */
    c.fallen = true;
    collapseShow(c, true);
    S.count++;
    S.phase = 'wait';
    S.left = COLLAPSE_GAP + rand() * COLLAPSE_GAP;
    collapseDust(M, c, 34);
    var killed = [];
    for (var j = 0; j < M.people.length; j++) {
      var q = M.people[j];
      if (!q.alive) continue;
      var dx = q.pos.x - c.at[0], dz = q.pos.z - c.at[2];
      if (dx * dx + dz * dz > c.r * c.r) continue;
      /* AND UNDER IT, not merely near it. The footprint is a circle on
         the ground but the thing falling started at c.at[1] and came
         down by c.drop, so the band it swept is what it can hit.
         Without this the men on the crane deck died to the scaffold
         twenty metres below them. */
      if (q.pos.y > c.at[1] + 1.2 || q.pos.y < c.at[1] - c.drop - 2.0) continue;
      killed.push(q.id);
      hurt(M, null, q, 10000, false, emit);
    }
    var evC = { t: M.time, kind: 'collapse', at: c.at.slice(), r: c.r,
      what: c.name, killed: killed };
    M.events.push(evC); emit(evC);
  }

  function updateBomb(M, dt, emit, rand) {
    var B = M.bomb;
    if (!B) return;
    /* THE OPENING FREEZE.
     *
       A round starts with everybody dead for three seconds while they
       are put back. The elimination check ran during those three
       seconds, found nobody alive on either side, and ended the round
       -- which started another one, which also ended. A whole six-round
       match finished in THIRTEEN SECONDS and the bomb was never once
       carried anywhere, because no round ever lasted long enough for
       anybody to take a step.

       Nothing is decided until everybody is on their feet. */
    if (M.roundTime < 4.5) return;
    var alive = { a: 0, b: 0 };
    M.people.forEach(function (p) { if (p.alive) alive[p.team]++; });

    if (!B.planted) {
      var carrier = M.people[B.carrier];
      /* The bomb is dropped where its carrier fell, and the next
         attacker alive picks it up. A round that ends because the one
         man holding it died in the first ten seconds is not a round. */
      if (!carrier || !carrier.alive) {
        var site2 = M.map.sites[B.want];
        var next = M.people.filter(function (p) { return p.team === B.attackers && p.alive; })
          .sort(function (x, y) {
            return Math.hypot(x.pos.x - site2.at[0], x.pos.z - site2.at[2])
              - Math.hypot(y.pos.x - site2.at[0], y.pos.z - site2.at[2]);
          })[0];
        B.carrier = next ? next.id : null;
      }
      var c2 = B.carrier != null ? M.people[B.carrier] : null;
      /* GO TO THE OTHER ONE.
       *
         Thirty seconds in with nothing planted means the site being
         walked at is being held. A player would go to the other one,
         and until they did, whether a round was ever planted at all
         came down to which map and which seed: Helipad's first site is
         a helicopter parked in the middle of a completely open pad,
         which is a fine thing to fight over and a terrible thing to
         walk to in a straight line for six rounds running. Once per
         round, so it is a decision and not a dither. */
      if (c2 && c2.alive && !B.switched && M.roundTime > 20) {
        /* THE NEAREST OF THE OTHERS, not "the other one". With two
           sites that was the same sentence; with three it is not, and
           1 - want on a three-site map sends a carrier standing at
           site 2 off to site -1, which is nowhere. */
        var sn = M.map.sites[B.want];
        var dNow = Math.hypot(c2.pos.x - sn.at[0], c2.pos.z - sn.at[2]);
        var best = -1, bestD = Infinity;
        for (var oi = 0; oi < M.map.sites.length; oi++) {
          if (oi === B.want) continue;
          var so = M.map.sites[oi];
          var d = Math.hypot(c2.pos.x - so.at[0], c2.pos.z - so.at[2]);
          if (d < bestD) { bestD = d; best = oi; }
        }
        if (best >= 0 && bestD < dNow * 1.25) {
          B.want = best; B.switched = true; B.progress = 0;
          M.people.forEach(function (q) { if (q.team === B.attackers) { q.ai.goal = null; q.ai.goalAt = -99; } });
        }
      }
      /* WHOEVER IS STANDING ON IT PLANTS IT, not only the man the round
         started with.
       *
         The bomb was a relay baton: only its current carrier could
         advance the plant, and when he died the next nearest attacker
         inherited it wherever he happened to be -- usually forty metres
         away, with the progress bleeding off the whole way back. On
         Town, the biggest of the four, that meant six rounds could go
         by without a plant depending on nothing but the seed.

         A bomb is a thing on the ground at the site. Anybody on the
         attacking side who is standing there is planting it, and two of
         them there is faster than one. */
      var site = M.map.sites[B.want];
      var onSite = M.people.filter(function (q) {
        return q.team === B.attackers && q.alive
          && Math.hypot(q.pos.x - site.at[0], q.pos.z - site.at[2]) < site.r;
      });
      if (onSite.length) {
        B.lastAt = M.time;
        B.progress += dt * (1 + (onSite.length - 1) * 0.40);
        if (B.progress >= 2.8) {
          B.planted = true; B.plantAt = M.time; B.site = site; B.progress = 0;
          /* The bomb goes INTO the tank and the tank is locked. Which
             wire is the one is decided now, out of the match's own
             seeded random, so a replay of a match cuts the same wire. */
          var order = shuffledWires(rand);
          B.tank = {
            cut: 0, open: false, inside: 0, ready: false, weld: 0,
            wires: order, correct: order[0], tried: [],
            failsafe: 0, worker: null, welder: null, lastWork: M.time,
          };
          showTank(site, false);
          var ev = { t: M.time, kind: 'plant', who: onSite[0].id, site: site.id };
          M.events.push(ev); emit(ev);
        }
      } else if (M.time - (B.lastAt || 0) > 5) {
        /* Only once the site has been properly given up. A plant that
           unwinds the moment its man is killed is a plant that only
           ever happens uncontested. */
        B.progress = Math.max(0, B.progress - dt * 0.35);
      }
      if (alive[B.attackers] === 0) return endRound(M, B.defenders, 'attackers eliminated', emit);
      if (alive[B.defenders] === 0) return endRound(M, B.attackers, 'defenders eliminated', emit);
      if (M.roundTime - 4.5 > M.mode.seconds) return endRound(M, B.defenders, 'time', emit);
      return;
    }

    /* Planted. The clock is the only thing that matters now -- killing
       the last defender does not win it, and that is the mode. */
    var T = B.tank;
    if (!T) {
      /* A round that was already in progress when this code arrived, or
         a map with no tanks. Arm one rather than run without it: a
         missing tank must not become a defuse that can never happen. */
      var ord = shuffledWires(rand || Math.random);
      T = B.tank = { cut: 0, open: false, inside: 0, ready: false, weld: 0,
        wires: ord, correct: ord[0], tried: [], failsafe: 0,
        worker: null, welder: null, lastWork: M.time };
    }
    var defusing = atSite(M, B.defenders, B.site);
    var guarding = atSite(M, B.attackers, B.site);

    /* THE FAILSAFE RUNS WHATEVER ELSE IS HAPPENING. Once a wrong wire
       has been cut the ten seconds are the ten seconds -- being killed
       off the tank does not stop the countdown, and that is the whole
       weight of getting it wrong. */
    if (T.failsafe > 0) {
      T.failsafe -= dt;
      if (T.failsafe <= 0) {
        T.failsafe = 0;
        var evF = { t: M.time, kind: 'failsafe', site: B.site.id };
        M.events.push(evF); emit(evF);
        releaseAll(M);
        return endRound(M, B.attackers, 'detonated', emit);
      }
    }

    /* ---- the man doing the work ---- */
    var worker = T.worker != null ? M.people[T.worker] : null;
    if (worker && (!worker.alive || worker.team !== B.defenders)) { clearBusy(worker); worker = null; T.worker = null; }
    if (!worker && defusing.length && !T.ready) {
      worker = defusing[0]; T.worker = worker.id;
    }
    /* A worker who is somehow no longer at the tank -- knocked back by a
       blast, most likely -- gives the job up rather than working on it
       from wherever he landed. */
    if (worker && defusing.indexOf(worker) < 0) { clearBusy(worker); worker = null; T.worker = null; }

    if (worker) {
      T.lastWork = M.time;
      if (!T.open) {
        setBusy(M, worker, 'cut', B.site);
        T.cut += dt * (1 + (defusing.length - 1) * 0.30);
        if (T.cut >= SND.lock) {
          T.cut = SND.lock; T.open = true;
          showTank(B.site, true);
          var evC = { t: M.time, kind: 'cut', who: worker.id, site: B.site.id };
          M.events.push(evC); emit(evC);
        }
      } else if (!T.ready) {
        setBusy(M, worker, 'inside', B.site);
        T.inside += dt * (1 + (defusing.length - 1) * 0.30);
        if (T.inside >= SND.inside) {
          T.inside = SND.inside; T.ready = true;
          setBusy(M, worker, 'wires', B.site);
          var evW = { t: M.time, kind: 'wires', who: worker.id, site: B.site.id };
          M.events.push(evW); emit(evW);
        }
      }
    } else if (M.time - T.lastWork > SND.hold) {
      /* Only once the tank has properly been given up. Work that
         unwinds the instant its man is shot is work that only ever
         gets finished uncontested. */
      if (!T.open) T.cut = Math.max(0, T.cut - dt * 0.5);
      else T.inside = Math.max(0, T.inside - dt * 0.4);
    }

    /* ---- and the blowtorch ---- */
    var welder = T.welder != null ? M.people[T.welder] : null;
    if (welder && (!welder.alive || guarding.indexOf(welder) < 0)) { clearBusy(welder); welder = null; T.welder = null; }
    /* Only worth doing on a tank that is open, and only with nobody in
       it -- welding a man into a steel box is not a thing this mode is
       going to do to anybody. */
    if (T.open && !T.ready && !worker && guarding.length) {
      if (!welder) { welder = guarding[0]; T.welder = welder.id; }
      setBusy(M, welder, 'weld', B.site);
      T.weld += dt * (1 + (guarding.length - 1) * 0.30);
      if (T.weld >= SND.weld) {
        clearBusy(welder);
        T.weld = 0; T.open = false; T.cut = 0; T.inside = 0; T.welder = null;
        showTank(B.site, false);
        var evB = { t: M.time, kind: 'weld', who: welder.id, site: B.site.id };
        M.events.push(evB); emit(evB);
      }
    } else {
      if (welder) { clearBusy(welder); T.welder = null; }
      T.weld = Math.max(0, T.weld - dt * 0.6);
    }

    /* ---- a bot at the wires picks one ---- */
    if (T.ready && worker && worker.bot) {
      if (T.botAt == null) T.botAt = M.time + 1.2 + rnd(rand) * 1.6;
      if (M.time >= T.botAt) {
        T.botAt = null;
        var left = T.wires.filter(function (w) { return T.tried.indexOf(w) < 0; });
        /* A better bot guesses better. Not certainty even at the top --
           a mode where the best bots always cut the right wire first is
           a mode with no failsafe in it. */
        var sure = worker.skill && worker.skill.aim != null ? 0.30 + worker.skill.aim * 0.45 : 0.45;
        var pick = (rnd(rand) < sure || left.length === 1)
          ? T.correct : left[Math.floor(rnd(rand) * left.length) % left.length];
        if (left.indexOf(pick) < 0) pick = left[0];
        var r = cutWire(M, worker, pick, emit);
        if (r === 'defused') return endRound(M, B.defenders, 'defused', emit);
      }
    }

    /* Detonation, and the one thing that is not decided by it. */
    if (M.time - B.plantAt > 45) { releaseAll(M); return endRound(M, B.attackers, 'detonated', emit); }
    if (alive[B.defenders] === 0 && !defusing.length && T.failsafe <= 0) {
      releaseAll(M);
      return endRound(M, B.attackers, 'defenders eliminated', emit);
    }
    return undefined;
  }

  function rnd(rand) { return typeof rand === 'function' ? rand() : Math.random(); }

  /* CUT ONE. The same call for a bot and for the player, because the
     rule about what a wrong wire costs must not depend on who cut it.
     Returns 'defused', 'wrong', or 'no' when there was nothing to cut. */
  function cutWire(M, p, colour, emit) {
    var B = M.bomb, T = B && B.tank;
    if (!T || !T.ready || !p || !p.alive) return 'no';
    if (T.worker !== p.id) return 'no';
    if (T.tried.indexOf(colour) >= 0 || T.wires.indexOf(colour) < 0) return 'no';
    var ev;
    if (colour === T.correct) {
      clearBusy(p);
      releaseAll(M);
      ev = { t: M.time, kind: 'defuse', who: p.id, wire: colour };
      M.events.push(ev); if (emit) emit(ev);
      return 'defused';
    }
    T.tried.push(colour);
    /* The failsafe arms ONCE. Cutting a second wrong wire inside the
       ten seconds does not buy another ten. */
    if (T.failsafe <= 0) T.failsafe = SND.failsafe;
    ev = { t: M.time, kind: 'wrongWire', who: p.id, wire: colour };
    M.events.push(ev); if (emit) emit(ev);
    return 'wrong';
  }

  function endRound(M, winner, why, emit) {
    releaseAll(M);
    M.score[winner]++;
    var ev = { t: M.time, kind: 'roundEnd', winner: winner, why: why,
      score: { a: M.score.a, b: M.score.b } };
    M.events.push(ev); emit(ev);
    if (M.score[winner] >= M.mode.score) return finish(M, winner, emit);
    M.round++;
    M.people.forEach(function (p) { p.alive = false; p.respawnAt = M.time + 3.0; });
    armRound(M);
    return undefined;
  }

  function finish(M, winner, emit) {
    M.over = true;
    M.winner = winner;
    var ev = { t: M.time, kind: 'matchEnd', winner: winner,
      score: { a: M.score.a, b: M.score.b } };
    M.events.push(ev); emit(ev);
    return undefined;
  }

  /* ================================================================
     THE TICK
     ================================================================ */

  /* How far outside the zone a body is, in metres, or 0 for inside.
     The largest overshoot on either axis, so a corner is as far out as
     it looks rather than the sum of two smaller numbers. */
  function outsideBy(M, pos) {
    var z = M.map && M.map.zone;
    if (!z) return 0;
    var dx = Math.max(z.x0 - pos.x, pos.x - z.x1, 0);
    var dz = Math.max(z.z0 - pos.z, pos.z - z.z1, 0);
    return Math.max(dx, dz);
  }

  function zoneTick(M, p, dt) {
    var out = outsideBy(M, p.pos);
    if (out <= 0) { p.zoneLeft = 0; return; }
    /* Counts from ten the first time it is noticed rather than from
       whatever is left of a previous excursion. */
    if (!(p.zoneLeft > 0)) p.zoneLeft = ZONE_GRACE;
    p.zoneLeft -= dt;
    if (p.zoneLeft > 0) return;
    p.zoneLeft = 0;
    /* Dying out here is a death like any other -- it counts against
       you, it clears your streak, and nobody is credited with it. */
    p.alive = false;
    p.deaths++;
    p.streak = 0;
    p.busy = null;
    p.respawnAt = M.time + Math.max(RESPAWN_FLOOR, RESPAWN);
  }

  function update(M, dt, rand, emit) {
    if (M.over) return;
    dt = Math.min(dt, 0.05);           // one long frame must not teleport anybody
    M.time += dt;
    M.roundTime += dt;

    /* How many are left on each side, counted once and read by
       everybody. The bots need it to know when their round is slipping
       away, and counting it inside twelve bot brains is twelve times
       the work for the same number. */
    M_TIME = M.time;
    DT_LAST = dt;
    if (M.decals) M.decals.tick(dt);
    recSample(M, dt);
    hlTick(M);
    M._pathBudget = 1;
    M.aliveCount = { a: 0, b: 0 };
    for (var c0 = 0; c0 < M.people.length; c0++) {
      if (M.people[c0].alive) M.aliveCount[M.people[c0].team]++;
    }

    for (var i = 0; i < M.people.length; i++) {
      var p = M.people[i];
      /* Posed every tick, alive or not, and BEFORE the early return --
         a body that stops moving stops calling moveBy, so animating
         from inside the mover left anyone who came to a halt frozen
         mid-stride until they set off again. */
      if (p.actor && !M.replaying) animate(p, dt);
      if (!p.alive) {
        /* Search and Destroy has no respawns inside a round. The round
           itself puts everybody back, in the first few seconds of it. */
        if (M.time >= p.respawnAt && (!M.mode.bomb || M.roundTime < 4.0)) spawn(M, p, false);
        continue;
      }
      settleKick(M, p, dt);
      /* EVERYBODY'S SWAP, not just the one being steered by a keyboard.
       *
         The first version of this ran runSwap inside the human command
         path only, and beginReload calls beginSwap when you are out of
         reserve -- so a bot that emptied its primary would set a swap
         that nothing ever advanced and stand there for the rest of the
         match holding an empty gun. Twelve of them, every match.
         Lifting it here means one call covers bots and the player, and
         a swap cannot be half-run by whoever happens to own the tick. */
      runSwap(M, p);
      if (M.time >= p.reloadUntil && p.reloadUntil > 0) { finishReload(M, p); p.reloadUntil = 0; }
      /* Health comes back after five seconds untouched. Without it every
         fight after the first is decided by the one before it. */
      if (p.hp < HEALTH && M.time - (p.hurtAt || 0) > 5) p.hp = Math.min(HEALTH, p.hp + 18 * dt);
      if (p.bot) botThink(M, p, dt, rand, emit);
      /* OUTSIDE THE COMBAT ZONE. Ten seconds, then you are dead, and
         the same ten seconds for a bot as for the player. Cleared the
         moment you are back inside, so stepping out and back in costs
         nothing -- the timer is a leash, not a punishment for touching
         the edge. */
      zoneTick(M, p, dt);
      /* Out of the world. It should not be possible and it is checked
         for anyway, because the one time it happens it is a player
         falling for the rest of the match. */
      if (p.pos.y < -25) { p.alive = false; p.busy = null; p.deaths++; p.respawnAt = M.time + 2; }
    }

    /* Nobody stands inside anybody, and then everybody is placed. */
    separate(M);
    /* PLACEMENT IS A SECOND PASS, after everybody has moved, so a body
       is drawn where it is now rather than where it was last frame. */
    for (var j = 0; j < M.people.length; j++) place(M, M.people[j]);

    updateDoors(M, dt);
    updateCollapse(M, dt, emit, rand);
    if (M.mode.bomb) updateBomb(M, dt, emit, rand);
    else {
      if (M.score.a >= M.mode.score) return finish(M, 'a', emit);
      if (M.score.b >= M.mode.score) return finish(M, 'b', emit);
      if (M.time >= M.mode.minutes * 60) {
        return finish(M, M.score.a === M.score.b ? null : (M.score.a > M.score.b ? 'a' : 'b'), emit);
      }
    }
    return undefined;
  }

  /* ================================================================
     THE PLAYER
     ================================================================
     You are combatant zero and you move, shoot and reload through the
     same functions the bots do. The only thing this adds is reading a
     set of intentions instead of deciding them, which is the whole of
     the difference between a person and a bot and should be the whole
     of the difference in the code as well. */
  function control(M, cmd, dt) {
    var p = M.you;
    if (!p || !p.alive || M.over) return;
    /* THE PLAYER IS HELD THE SAME WAY A BOT IS, and by the same
       function. Two separate implementations of "you cannot move" is
       two chances for one of them to be the broken one. Note this is
       before the yaw is taken from the command: while you are cutting
       a lock the mouse does not turn you, the job does. */
    if (busyHold(M, p, dt)) return;
    var w = gun(p);
    p.yaw = cmd.yaw; p.pitch = cmd.pitch;
    p.aiming = !!cmd.aim;

    var fwd = cmd.forward || 0, str = cmd.right || 0;
    var len = Math.hypot(fwd, str);
    if (len > 1) { fwd /= len; str /= len; }
    /* Sprinting is forward only, and you cannot sprint down your sights.
       Crouching is slower and steadier. */
    var sprint = cmd.run && fwd > 0.5 && !p.aiming && !p.prone;

    /* ================================================================
       ONE KEY, THREE THINGS
       ================================================================
       The crouch key was a hold: let go and you stood up, which means
       playing a whole firefight from cover with a finger down. It is
       three separate actions now and which one you get depends only on
       how long you hold it and what you were doing:

         TAP                     crouch toggles. Press again to stand.
         HOLD while sprinting    a slide.
         HOLD while not          a DROP: you go flat, fast, and it
                                 costs one point of health, because a
                                 man throwing himself on concrete does
                                 not do it for free.

       HOLD_T is the fence between a tap and a hold. Two hundred and
       twenty milliseconds: long enough that a deliberate crouch never
       becomes a dive, short enough that a dive never feels queued. */
    var HOLD_T = 0.22;
    var held = !!cmd.crouch;
    if (held && !p._crouchWas) { p._crouchDown = M.time; p._crouchUsed = false; }
    if (held && !p._crouchUsed && M.time - (p._crouchDown || 0) >= HOLD_T) {
      p._crouchUsed = true;                 // this press is a hold, not a tap
      if (sprint && p.grounded && M.time > (p.slideEnd || 0) + 0.45) {
        p._wantSlide = true;
      /* `p.proneAt == null`, NOT `p.proneAt || 0`. A cooldown measured
         from a default of zero is a cooldown that has not expired for
         the first nine tenths of a second of the match, and a player
         who tries to drop in that window silently does nothing. It
         cost one probe to find and it would have cost a bug report
         that read "sometimes the drop just doesn't work". Never
         default a TIME to zero when zero is a real time. */
      } else if (!p.prone && p.grounded
          && M.time > (p.proneAt == null ? -99 : p.proneAt) + 0.9) {
        /* THE DROP. */
        p.prone = true;
        p.proneAt = M.time;
        p.crouching = false;
        p.hp = Math.max(1, p.hp - 1);
        p.hurtAt = M.time;                  // and it stops your regeneration
        p.sprinting = false;
      }
    }
    if (!held && p._crouchWas) {
      if (!p._crouchUsed) {
        /* A TAP. */
        if (p.prone) { p.prone = false; p.proneAt = M.time; p.crouching = true; }
        else p.crouching = !p.crouching;
      }
      p._crouchUsed = false;
    }
    p._crouchWas = held;
    /* Standing up out of prone takes a moment during which you are
       neither flat nor upright, and jumping does it too. */
    if (p.prone && cmd.jump) { p.prone = false; p.proneAt = M.time; p.crouching = true; }

    /* THE SLIDE.
     *
       Entered from a sprint and from nothing else, because a slide from
       standing is a crouch with extra steps. It keeps the speed you
       came in with plus a shove, bleeds it off over about three
       quarters of a second, and drops you to crouch height for the
       whole of it -- so it is genuinely a way under a sightline and not
       only a way to look busy.

       The recovery is the cost. For a fifth of a second after it ends
       you are standing up and cannot fire, which is what stops it being
       a free dodge you spam round every corner. */
    if ((cmd.slide || p._wantSlide) && sprint && p.grounded
        && M.time > (p.slideEnd == null ? -99 : p.slideEnd) + 0.45) {
      p._wantSlide = false;
      p.sliding = true;
      /* THE PRESS IS SPENT. Circle is the crouch button, and the crouch
         key is three actions decided by how long you hold it: tap to
         crouch, hold while sprinting to slide, hold otherwise to DROP
         flat. Entering a slide from the press -- which is what a pad
         does now -- leaves the button still down, and 220 ms later the
         same unbroken press reaches the hold path. By then the slide
         has set p.sprinting false, so it takes the `else` branch and
         throws you on your face in the middle of your own slide, and
         you stay prone, and prone cancels sprint, so nothing sprints
         again for the rest of the life.

         Marking the press used is what already stops a tap and a hold
         both firing; it stops a slide and a drop both firing too. */
      p._crouchUsed = true;
      p.slideEnd = M.time + 0.72;
      p.slideDir = { x: Math.sin(p.yaw), z: Math.cos(p.yaw) };
      p.slideSpeed = 5.2 * w.move * 1.62;
    }
    p._wantSlide = false;
    if (p.sliding && (M.time >= p.slideEnd || !p.grounded)) {
      p.sliding = false;
      p.slideRecover = M.time + 0.20;
    }
    if (p.sliding) {
      /* Only the last of the speed is steerable, so a slide commits you
         to roughly where you pointed it. */
      var left = Math.max(0, (p.slideEnd - M.time) / 0.72);
      var sp2 = p.slideSpeed * (0.35 + 0.65 * left);
      var steer2 = 1 - left * 0.85;
      var rr = RIGHT(p.yaw);
      var dx = p.slideDir.x + rr.x * str * steer2;
      var dz = p.slideDir.z + rr.z * str * steer2;
      var dl = Math.hypot(dx, dz) || 1;
      moveBy(M, p, (dx / dl) * sp2, (dz / dl) * sp2, dt, false);
      p.crouching = true;
      p.sprinting = false;
      return;
    }

    /* Flat on your face you crawl, and for the first third of a second
       of a drop you are not moving at all -- you are landing. */
    var settling = p.prone && M.time - (p.proneAt || 0) < 0.34;
    var speed = 5.2 * w.move * (sprint ? 1.34 : 1)
      * (p.prone ? (settling ? 0 : 0.21) : (p.crouching ? 0.52 : 1))
      * (p.aiming ? 0.62 : 1);
    var sy = Math.sin(p.yaw), cy = Math.cos(p.yaw);
    var rt = RIGHT(p.yaw);
    moveBy(M, p, (sy * fwd + rt.x * str) * speed, (cy * fwd + rt.z * str) * speed, dt,
      !!cmd.jump && p.grounded);

    if (cmd.swap) beginSwap(M, p, 1 - p.held);
    /* No reload while the gun is on its way down or up. You cannot
       change a magazine in a weapon you are in the middle of putting
       away, and letting it start here is how a reload came to finish
       into the other gun. */
    if (cmd.reload && !p.reloadUntil && !p.swapUntil && p.ammo[p.held] < w.mag) beginReload(M, p);
    /* Not while you are getting up out of a slide. */
    if (cmd.fire && M.time >= (p.slideRecover || 0) && !settling
        && (w.auto || !p._heldTrigger)) {
      fireHuman(M, p);
    }
    p._heldTrigger = !!cmd.fire;
    p.sprinting = sprint;
  }

  var humanRand = rng(0x5eed);
  function fireHuman(M, p) { return fire(M, p, humanRand, M._emit || function () {}); }

  function scoreboard(M) {
    return M.people.slice().sort(function (x, y) {
      return (y.kills - y.deaths) - (x.kills - x.deaths) || y.kills - x.kills;
    }).map(function (p) {
      return { id: p.id, name: p.name, team: p.team, bot: p.bot,
        kills: p.kills, deaths: p.deaths, damage: Math.round(p.damage),
        best: p.bestStreak, gun: p.guns[0].name,
        skill: p.skill ? p.skill.name : 'player' };
    });
  }

  W.MP_MATCH = {
    start: start,
    HEALTH: HEALTH, EYE: EYE, RESPAWN: RESPAWN,
    damageAt: damageAt, botLoadout: botLoadout, control: control,
    /* Search and Destroy, for the HUD and for the tests. cutWire is
       the ONE way a wire gets cut, by a bot or by the player. */
    SND: SND, cutWire: cutWire, atSite: atSite,
    DOOR_RATE: DOOR_RATE,
    /* The collapses, for the HUD and for the test that has to be able
       to bring one down on demand rather than waiting half a minute
       for the timer to come round. */
    COLLAPSE_GAP: COLLAPSE_GAP, COLLAPSE_FALL: COLLAPSE_FALL,
    resetCollapses: resetCollapses,
    muzzleOf: muzzleOf, kickFrom: kickFrom, settleKick: settleKick,
    AIM_Y: 1.25, aimYOf: aimYOf, GRAVITY: GRAVITY, JUMP: JUMP,
    nav: { build: navBuild, path: navPath, clear: navClear, blocked: navBlocked,
      flood: navFlood, snap: navSnap, reachable: navReachable, CELL: NAV_CELL },
  };
})();
