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
  var RESPAWN = 5.0;            // seconds, team deathmatch
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
    function sweep(along) {
      var n = along === 'x' ? h : w;
      for (var k = 0; k < n; k++) {
        var fixed = (along === 'x' ? box.z0 : box.x0) + (k + 0.5) * c;
        var t = 0;
        var span = along === 'x' ? box.x1 - box.x0 : box.z1 - box.z0;
        for (var guard = 0; guard < 400 && t < span; guard++) {
          var ox = along === 'x' ? box.x0 + t : fixed;
          var oz = along === 'x' ? fixed : box.z0 + t;
          var dir = along === 'x' ? [1, 0, 0] : [0, 0, 1];
          var hit = game.raycast([ox, y, oz], dir, span - t, solid);
          if (!hit) break;
          var d = Math.hypot(hit.point.x - ox, hit.point.z - oz);
          mark(hit.point.x, hit.point.z);
          t += d + c * 0.5;
        }
      }
    }
    sweep('x'); sweep('z');
    return { box: box, w: w, h: h, c: c, g: g };
  }

  function navBlocked(nav, i, j) {
    if (i < 0 || j < 0 || i >= nav.w || j >= nav.h) return true;
    return nav.g[j * nav.w + i] === 1;
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
    var open = [start];
    function hEst(k) {
      var i = k % w, j = (k / w) | 0;
      var dx = Math.abs(i - ti), dz = Math.abs(j - tj);
      return (dx + dz) + (Math.SQRT2 - 2) * Math.min(dx, dz);
    }
    var found = false, guard = 0;
    while (open.length && guard++ < 60000) {
      var bi = 0, bf = Infinity;
      for (var k2 = 0; k2 < open.length; k2++) {
        var f = gScore[open[k2]] + hEst(open[k2]);
        if (f < bf) { bf = f; bi = k2; }
      }
      if (stats) stats.pathCells++;
      var cur = open.splice(bi, 1)[0];
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
            if (open.indexOf(kk) < 0) open.push(kk);
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
      hp: HEALTH, alive: false, respawnAt: 0,
      pos: { x: 0, y: 0, z: 0 }, yaw: 0, pitch: 0,
      vel: { x: 0, z: 0 },
      actor: null,
      guns: [primary, secondary], held: 0,
      ammo: [primary.mag, secondary.mag],
      reserve: [primary.mag * 6, secondary.mag * 6],
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

    /* ---- who is playing ---- */
    var people = [];
    var names = MP_DATA.BOT_NAMES.slice();
    var you = opts.you || {};
    people.push(makeCombatant(null, 0, 'a', {
      name: you.name || 'YOU', bot: !!opts.youBot,
      skill: opts.youBot ? MP_DATA.BOT_SKILL[2] : null,
      loadout: you.loadout || MP_DATA.defaultLoadout(),
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
      people: people, time: 0, over: false, winner: null,
      score: { a: 0, b: 0 }, round: 1, roundTime: 0,
      bomb: null, events: [],
      headless: headless,
      you: people[0],
    };

    /* ---- bodies ---- */
    people.forEach(function (p) {
      if (headless) return;
      var c = p.team === 'a' ? 0x4c6a8a : 0x8a5a4c;
      p.actor = game.character({
        at: [0, -50, 0], name: 'mp-' + p.id,
        material: { preset: 'fabric', color: c },
        height: 1.75, radius: 0.32, speed: 4.6, runSpeed: 6.4,
      });
      if (p.actor && p.actor.body) p.actor.body.userData = { actor: true, mp: p.id };
    });

    /* ---- the first spawn ---- */
    people.forEach(function (p) { spawn(M, p, true); });
    if (mode.bomb) armRound(M);

    M.update = function (dt) { update(M, dt, rand, emit); };
    M.scoreboard = function () { return scoreboard(M); };
    M.spawnOf = function (p) { return pickSpawn(M, p); };
    M.damage = function (from, to, amount, head) { return hurt(M, from, to, amount, head, emit); };
    M.fire = function (p) { return fire(M, p, rand, emit); };
    M.nav = nav;
    return M;
  }

  /* A bot's class. Weighted rather than uniform, because players are:
     most of a lobby is carrying a rifle or an SMG, one person has a
     sniper, and somebody always has the shotgun. */
  function botLoadout(rand) {
    var r = rand();
    var cls = r < 0.42 ? 'assault' : r < 0.72 ? 'smg' : r < 0.84 ? 'lmg'
      : r < 0.95 ? 'special' : 'pistol';
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
    p.held = 0;
    p.ammo = [p.guns[0].mag, p.guns[1].mag];
    p.reloadUntil = 0; p.nextShot = 0;
    p.ai.state = 'advance'; p.ai.target = null; p.ai.path = null;
    p.ai.goal = null; p.ai.goalAt = -99;
    if (p.actor && p.actor.controller) {
      p.actor.controller.teleport([p.pos.x, p.pos.y + 0.9, p.pos.z]);
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

  function eyeOf(p) { return { x: p.pos.x, y: p.pos.y + EYE, z: p.pos.z }; }

  function losClear(M, from, to) {
    if (M.stats) M.stats.losCalls++;
    var dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    var len = Math.hypot(dx, dy, dz);
    if (len < 0.01) return true;
    var h = M.game.raycast([from.x, from.y, from.z], [dx / len, dy / len, dz / len], len - 0.25,
      function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); });
    return !h;
  }

  /* Where along the ray the body is, and how far off the line. Returns
     null for a miss, otherwise the distance and whether it was a head. */
  function rayBody(from, dir, p) {
    var ox = p.pos.x - from.x, oy = (p.pos.y + 0.9) - from.y, oz = p.pos.z - from.z;
    var along = ox * dir.x + oy * dir.y + oz * dir.z;
    if (along <= 0.2) return null;
    var cx = ox - dir.x * along, cy = oy - dir.y * along, cz = oz - dir.z * along;
    var off = Math.hypot(cx, cy, cz);
    /* A body is a 0.34 m capsule from the ankles to the shoulders with
       a 0.13 m head on top of it. Off-axis distance decides which. */
    if (off > 0.40) return null;
    var hy = (from.y + dir.y * along) - (p.pos.y + 1.60);
    var head = Math.abs(hy) < 0.16 && off < 0.20;
    return { d: along, head: head };
  }

  function fire(M, p, rand, emit) {
    var w = gun(p);
    if (!p.alive || M.time < p.nextShot || M.time < p.reloadUntil) return null;
    if (p.ammo[p.held] <= 0) { beginReload(M, p); return null; }
    p.ammo[p.held]--;
    p.nextShot = M.time + 60 / w.rpm;
    if (M.stats) M.stats.shots++;

    var from = eyeOf(p);
    /* Aimed or from the hip. A bot is aiming whenever it is engaging;
       you are aiming when you are holding the button. */
    var cone = ((p.aiming || p.ai.state === 'engage') ? w.adsSpread : w.spread) * Math.PI / 180;
    if (p.bot && p.skill) cone *= (1.9 - p.skill.aim);
    var out = [];
    for (var s = 0; s < (w.pellets || 1); s++) {
      var yaw = p.yaw + (rand() - 0.5) * cone;
      var pitch = p.pitch + (rand() - 0.5) * cone;
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
      if (best) {
        if (M.stats) M.stats.hits++;
        var amount = damageAt(w, best.r.d) * (best.r.head ? w.hs : 1);
        out.push(hurt(M, p, best.q, amount, best.r.head, emit));
      }
    }
    if (p.ammo[p.held] <= 0) beginReload(M, p);
    return out;
  }

  function beginReload(M, p) {
    var w = gun(p);
    if (p.reserve[p.held] <= 0) {
      /* Out. Swap to the other gun rather than standing there, which is
         what a player does and what makes a secondary worth having. */
      var other = 1 - p.held;
      if (p.ammo[other] > 0 || p.reserve[other] > 0) { p.held = other; p.nextShot = M.time + 0.45; }
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
    to.respawnAt = M.time + RESPAWN;
    if (from) {
      from.kills++;
      from.streak++;
      if (from.streak > from.bestStreak) from.bestStreak = from.streak;
      if (M.mode.id === 'tdm') M.score[from.team]++;
    }
    if (to.actor && to.actor.controller) to.actor.controller.teleport([to.pos.x, -60, to.pos.z]);
    var ev = { t: M.time, kind: 'kill', by: from ? from.id : null, who: to.id, head: !!head,
      weapon: from ? gun(from).id : null };
    M.events.push(ev);
    emit(ev);
    return dealt;
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

  function groundAt(M, x, z, from) {
    var h = M.game.raycast([x, from == null ? 8 : from, z], [0, -1, 0], 40,
      function (b) { return b && !b.isTrigger && !(b.userData && b.userData.actor); });
    return h ? h.point.y : null;
  }

  function moveBy(M, p, vx, vz, dt) {
    var nx = p.pos.x + vx * dt, nz = p.pos.z + vz * dt;
    if (!cellBlocked(M.nav, nx, nz)) { p.pos.x = nx; p.pos.z = nz; }
    else {
      if (!cellBlocked(M.nav, nx, p.pos.z)) p.pos.x = nx;
      if (!cellBlocked(M.nav, p.pos.x, nz)) p.pos.z = nz;
    }
    var g = groundAt(M, p.pos.x, p.pos.z, p.pos.y + 2.2);
    if (g != null && Math.abs(g - p.pos.y) < 2.0) p.pos.y = g;
    else if (g != null && g < p.pos.y) p.pos.y = Math.max(g, p.pos.y - 9 * dt);
    if (p.actor && p.actor.controller) {
      p.actor.controller.teleport([p.pos.x, p.pos.y + 0.9, p.pos.z]);
      if (p.actor.rotation && p.actor.rotation.setFromAxisAngle) {
        p.actor.rotation.setFromAxisAngle([0, 1, 0], p.yaw);
      }
    }
  }

  /* Turn towards a heading, at a rate. Snapping to face a target is
     what makes a bot feel like a turret; a rate makes it feel like
     somebody who has just noticed you. */
  function turnTo(p, wantYaw, rate, dt) {
    var d = wantYaw - p.yaw;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    var step = rate * dt;
    p.yaw += Math.max(-step, Math.min(step, d));
    return Math.abs(d);
  }

  function yawTo(from, to) { return Math.atan2(to.x - from.x, to.z - from.z); }

  /* ================================================================
     THE BOT
     ================================================================
     Four states. A bot with fourteen states does something
     inexplicable once a match and ruins it. */

  function botThink(M, p, dt, rand, emit) {
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
        if (d > w.far * 1.8 + 12) continue;
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
    var hurtBadly = p.hp < 38;
    ai.state = (t && M.time >= (ai.reactAt || 0)) ? (hurtBadly ? 'break' : 'engage') : 'advance';

    if (M.stats) M.stats[ai.state === 'engage' ? 'engageTicks'
      : ai.state === 'break' ? 'breakTicks' : 'advanceTicks']++;

    if (ai.state === 'engage') {
      var d2 = Math.hypot(t.pos.x - p.pos.x, t.pos.z - p.pos.z);
      var off = turnTo(p, yawTo(p.pos, t.pos), 5.0 + sk.aim * 5.0, dt);
      p.pitch = Math.atan2((p.pos.y + EYE) - (t.pos.y + 1.45), Math.max(0.5, d2));
      /* Strafe rather than stand. Changed at intervals, not per frame,
         or the body vibrates on the spot. */
      ai.jitter -= dt;
      if (ai.jitter <= 0) { ai.jitter = 0.5 + rand() * 1.1; ai.strafe = rand() < 0.5 ? -1 : 1; }
      var side = { x: Math.cos(p.yaw), z: -Math.sin(p.yaw) };
      var want = d2 > w.near * 0.9 ? 1 : (d2 < w.near * 0.35 ? -1 : 0);
      var sp = 4.4 * w.move;
      moveBy(M, p,
        Math.sin(p.yaw) * want * sp * 0.75 + side.x * ai.strafe * sp * 0.6,
        Math.cos(p.yaw) * want * sp * 0.75 + side.z * ai.strafe * sp * 0.6, dt);
      if (off < 0.14 && M.time >= p.nextShot) fire(M, p, rand, emit);
      return;
    }

    if (ai.state === 'break') {
      /* Hurt: back off the way you came and let it regenerate. Bots
         that fight to the death make every trade a coin flip. */
      var away = yawTo(t.pos, p.pos);
      turnTo(p, away, 6.0, dt);
      moveBy(M, p, Math.sin(away) * 5.2, Math.cos(away) * 5.2, dt);
      if (M.time - ai.lostAt > 2.5 || p.hp > 70) ai.state = 'advance';
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
      var run = 5.4 * gun(p).move;
      moveBy(M, p, Math.sin(p.yaw) * run, Math.cos(p.yaw) * run, dt);
    }
  }

  function dist2(a, b) { return Math.hypot(a.x - b.x, a.z - b.z); }

  /* Where a bot is trying to get to. In Search and Destroy that is the
     bomb, the site, or the man carrying it. In Team Deathmatch it is
     the middle of a lane in the other half, which is the honest answer
     to "where is the fight" on a three-lane map. */
  function pickGoal(M, p, rand) {
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
      var s2 = M.map.sites[att ? M.bomb.want : (rand() < 0.5 ? 0 : 1)];
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
    if (stale) {
      if (M.stats) M.stats.paths++;
      ai.path = navPath(M.nav, p.pos, goal, M.stats);
      ai.pathAt = M.time; ai.pathIdx = 0;
      if (M.stats && !ai.path) M.stats.pathFail++;
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
    var carriers = M.people.filter(function (p) { return p.team === attackers; });
    M.bomb = {
      attackers: attackers, defenders: attackers === 'a' ? 'b' : 'a',
      carrier: carriers.length ? carriers[0].id : null,
      want: (M.round % 2) ? 0 : 1,
      planted: false, plantAt: 0, progress: 0, site: null, defuse: 0,
    };
    M.roundTime = 0;
  }

  function updateBomb(M, dt, emit) {
    var B = M.bomb;
    if (!B) return;
    var alive = { a: 0, b: 0 };
    M.people.forEach(function (p) { if (p.alive) alive[p.team]++; });

    if (!B.planted) {
      var carrier = M.people[B.carrier];
      /* The bomb is dropped where its carrier fell, and the next
         attacker alive picks it up. A round that ends because the one
         man holding it died in the first ten seconds is not a round. */
      if (!carrier || !carrier.alive) {
        var next = M.people.filter(function (p) { return p.team === B.attackers && p.alive; })[0];
        B.carrier = next ? next.id : null;
      }
      var c2 = B.carrier != null ? M.people[B.carrier] : null;
      if (c2 && c2.alive) {
        var site = M.map.sites[B.want];
        var d = Math.hypot(c2.pos.x - site.at[0], c2.pos.z - site.at[2]);
        if (d < site.r) {
          B.progress += dt;
          if (B.progress >= 4.0) {
            B.planted = true; B.plantAt = M.time; B.site = site; B.progress = 0;
            var ev = { t: M.time, kind: 'plant', who: c2.id, site: site.id };
            M.events.push(ev); emit(ev);
          }
        } else B.progress = Math.max(0, B.progress - dt * 0.8);
      }
      if (alive[B.attackers] === 0) return endRound(M, B.defenders, 'attackers eliminated', emit);
      if (alive[B.defenders] === 0) return endRound(M, B.attackers, 'defenders eliminated', emit);
      if (M.roundTime > M.mode.seconds) return endRound(M, B.defenders, 'time', emit);
      return;
    }

    /* Planted. The clock is the only thing that matters now -- killing
       the last defender does not win it, and that is the mode. */
    var defusing = M.people.filter(function (p) {
      return p.team === B.defenders && p.alive
        && Math.hypot(p.pos.x - B.site.at[0], p.pos.z - B.site.at[2]) < B.site.r;
    });
    if (defusing.length) {
      B.defuse += dt * (1 + (defusing.length - 1) * 0.35);
      if (B.defuse >= 6.0) {
        var ev2 = { t: M.time, kind: 'defuse', who: defusing[0].id };
        M.events.push(ev2); emit(ev2);
        return endRound(M, B.defenders, 'defused', emit);
      }
    } else B.defuse = Math.max(0, B.defuse - dt * 0.5);
    if (M.time - B.plantAt > 45) return endRound(M, B.attackers, 'detonated', emit);
    if (alive[B.defenders] === 0 && !defusing.length) {
      return endRound(M, B.attackers, 'defenders eliminated', emit);
    }
    return undefined;
  }

  function endRound(M, winner, why, emit) {
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

  function update(M, dt, rand, emit) {
    if (M.over) return;
    dt = Math.min(dt, 0.05);           // one long frame must not teleport anybody
    M.time += dt;
    M.roundTime += dt;

    for (var i = 0; i < M.people.length; i++) {
      var p = M.people[i];
      if (!p.alive) {
        /* Search and Destroy has no respawns inside a round. The round
           itself puts everybody back, in the first few seconds of it. */
        if (M.time >= p.respawnAt && (!M.mode.bomb || M.roundTime < 4.0)) spawn(M, p, false);
        continue;
      }
      if (M.time >= p.reloadUntil && p.reloadUntil > 0) { finishReload(M, p); p.reloadUntil = 0; }
      /* Health comes back after five seconds untouched. Without it every
         fight after the first is decided by the one before it. */
      if (p.hp < HEALTH && M.time - (p.hurtAt || 0) > 5) p.hp = Math.min(HEALTH, p.hp + 18 * dt);
      if (p.bot) botThink(M, p, dt, rand, emit);
      /* Out of the world. It should not be possible and it is checked
         for anyway, because the one time it happens it is a player
         falling for the rest of the match. */
      if (p.pos.y < -25) { p.alive = false; p.deaths++; p.respawnAt = M.time + 2; }
    }

    if (M.mode.bomb) updateBomb(M, dt, emit);
    else {
      if (M.score.a >= M.mode.score) return finish(M, 'a', emit);
      if (M.score.b >= M.mode.score) return finish(M, 'b', emit);
      if (M.time >= M.mode.minutes * 60) {
        return finish(M, M.score.a === M.score.b ? null : (M.score.a > M.score.b ? 'a' : 'b'), emit);
      }
    }
    return undefined;
  }

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
    damageAt: damageAt, botLoadout: botLoadout,
    nav: { build: navBuild, path: navPath, clear: navClear, blocked: navBlocked, CELL: NAV_CELL },
  };
})();
