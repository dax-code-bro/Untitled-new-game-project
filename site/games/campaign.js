/* ================================================================
   THE CAMPAIGN DIRECTOR
   ================================================================
   Plays a mission from campaign-missions.js on the multiplayer engine.
   The match (mp-match.js) still owns movement, shooting, bots and
   pathfinding; this decides who is in play and where, what the bots
   are trying to do, what is said and by whom, where the camera is
   during a cutscene, and what counts as done.

   It talks to the match through a small set of hooks the match keeps
   for exactly this (M.director, M.spawnAt, M.park, M.groundAt) and to
   the game through the api MP_GAME.start returns (api.cinematic,
   api.lockControls).

   Lines are SPOKEN: by the synthesiser in each speaker's own voice,
   with a subtitle, and -- when the speaker is an ally standing where
   you can see them -- by their face, whose mouth makes the shapes of
   the words (engine LipSync / MhFace) with the expression the line
   asks for.

   Progress is saved on this machine: which missions are unlocked, and
   inside a mission the last checkpoint passed, so dying puts you back
   there and quitting and coming back does too.
   ================================================================ */
(function () {
  'use strict';
  var W = window;

  var SAVE_KEY = 'b9.campaign.v1';
  function loadSave() {
    try { return JSON.parse(W.localStorage.getItem(SAVE_KEY)) || {}; } catch (e) { return {}; }
  }
  function writeSave(s) { try { W.localStorage.setItem(SAVE_KEY, JSON.stringify(s)); } catch (e) { /* storage off */ } }

  var CSS = [
    '#cmp{position:fixed;inset:0;pointer-events:none;z-index:40;font-family:Georgia,"Times New Roman",serif;color:#e8ddc8}',
    '#cmp .obj{position:absolute;left:24px;top:22px;max-width:46vw;letter-spacing:.08em;text-shadow:0 1px 3px #000}',
    '#cmp .obj .k{font-size:11px;letter-spacing:.3em;color:#c9a35a;text-transform:uppercase}',
    '#cmp .obj .t{font-size:18px;margin-top:4px}',
    '#cmp .obj .p{height:3px;background:rgba(255,255,255,.15);margin-top:7px;width:220px;display:none}',
    '#cmp .obj .p i{display:block;height:100%;width:0;background:#c9a35a}',
    '#cmp .sub{position:absolute;left:50%;bottom:13%;transform:translateX(-50%);max-width:70vw;text-align:center;font-size:19px;line-height:1.4;',
    'background:rgba(0,0,0,.55);padding:8px 16px;border-radius:3px;display:none;text-shadow:0 1px 2px #000}',
    '#cmp .sub b{color:#c9a35a;font-weight:normal;letter-spacing:.14em;text-transform:uppercase;font-size:13px;margin-right:10px}',
    '#cmp .mark{position:absolute;width:18px;height:18px;margin:-9px 0 0 -9px;border:2px solid #c9a35a;transform:rotate(45deg);display:none;box-shadow:0 0 6px #000}',
    '#cmp .mark span{position:absolute;left:24px;top:-4px;transform:rotate(-45deg);font-size:12px;white-space:nowrap;color:#e8ddc8;text-shadow:0 1px 2px #000}',
    '#cmp .prompt{position:absolute;left:50%;top:60%;transform:translateX(-50%);font-size:15px;letter-spacing:.12em;display:none;background:rgba(0,0,0,.5);padding:6px 12px}',
    '#cmp .bars{position:absolute;inset:0;display:none}',
    '#cmp .bars:before,#cmp .bars:after{content:"";position:absolute;left:0;right:0;height:11vh;background:#000}',
    '#cmp .bars:before{top:0}#cmp .bars:after{bottom:0}',
    '#cmp .card{position:absolute;inset:0;background:rgba(5,6,10,.92);display:none;flex-direction:column;align-items:center;justify-content:center;pointer-events:auto}',
    '#cmp .card .k{font-size:12px;letter-spacing:.4em;color:#c9a35a;text-transform:uppercase}',
    '#cmp .card .h{font-size:40px;letter-spacing:.14em;margin:12px 0 6px;text-transform:uppercase}',
    '#cmp .card .s{font-size:14px;color:#a39a86;letter-spacing:.12em}',
    '#cmp .card ul{list-style:none;padding:0;margin:26px 0;font-size:15px;line-height:1.9;color:#cfc5b0;text-align:left}',
    '#cmp .card ul li:before{content:"\\25C7  ";color:#c9a35a}',
    '#cmp .card button{pointer-events:auto;font:inherit;letter-spacing:.3em;text-transform:uppercase;background:none;color:#e8ddc8;border:1px solid #c9a35a;padding:10px 26px;margin:6px;cursor:pointer}',
    '#cmp .card button:hover{background:#c9a35a;color:#05060a}',
    '#cmp .fade{position:absolute;inset:0;background:#000;opacity:0;transition:opacity .6s}',
    /* The multiplayer HUD's score, clock, kill feed, death panel and killstreak rail mean nothing in a
       story; during a cutscene nothing of the HUD is shown at all. */
    '#mpui.story .top,#mpui.story .dead,#mpui.story .board,#mpui.story .rail,#mpui.story .xpop{display:none!important}',
    '#mpui.cine{display:none!important}',
  ].join('\n');

  /* A place in a mission, as world x/z: [x, z], an anchor string, or { at, dx, dz }. */
  function placeOf(M, a) {
    if (!a) return null;
    if (Array.isArray(a)) return { x: a[0], z: a.length > 2 ? a[2] : a[1], y: a.length > 2 ? a[1] : undefined };
    if (typeof a === 'object' && a.at !== undefined) {
      var b = placeOf(M, a.at);
      return b ? { x: b.x + (a.dx || 0), z: b.z + (a.dz || 0) } : null;
    }
    if (typeof a === 'string') {
      var m = /^(spawnA|spawnB|site|lane):(.+)$/.exec(a);
      if (!m) return null;
      var map = M.map;
      if (m[1] === 'spawnA' || m[1] === 'spawnB') {
        var list = map.spawns[m[1] === 'spawnA' ? 'a' : 'b'], s = list[Math.max(0, Math.min(list.length - 1, +m[2] || 0))];
        var at = s.at || s;
        return { x: at[0], z: at.length > 2 ? at[2] : at[1] };
      }
      if (m[1] === 'site') {
        var site = map.sites.filter(function (q) { return q.id === m[2]; })[0] || map.sites[+m[2] || 0];
        return site ? { x: site.at[0], z: site.at[2] } : null;
      }
      var lane = map.lanes[Math.max(0, Math.min(map.lanes.length - 1, +m[2] || 0))];
      return { x: lane.x, z: 0 };
    }
    return null;
  }

  function Director(api, M, game, mission, opts) {
    opts = opts || {};
    var self = this;
    var save = loadSave();
    var root = document.createElement('div');
    root.id = 'cmp';
    root.innerHTML = '<div class="obj"><div class="k">Objective</div><div class="t"></div><div class="p"><i></i></div></div>'
      + '<div class="mark"><span></span></div><div class="prompt"></div><div class="bars"></div>'
      + '<div class="sub"></div><div class="card"></div><div class="fade"></div>';
    var st = document.createElement('style'); st.textContent = CSS; document.head.appendChild(st);
    document.body.appendChild(root);
    var $ = function (s) { return root.querySelector(s); };

    var mpui = document.getElementById('mpui');
    if (mpui) mpui.classList.add('story');
    var you = M.you;
    var allies = M.people.filter(function (p) { return p !== you && p.team === you.team; });
    var hostiles = M.people.filter(function (p) { return p.team !== you.team; });
    var byName = {};
    (mission.allies || []).forEach(function (a, i) {
      var p = allies[i];
      if (!p) return;
      p.name = a.name; byName[a.name] = p; p.voice = a.voice || {};
      // The weapon they are SEEN with, when it is not one of the multiplayer table's (Payback's Desert Eagle).
      if (a.gunModel && p.guns && p.guns[0]) p.guns[0] = Object.assign({}, p.guns[0], { id: a.gunModel });
    });
    // Allies past the mission's squad, and every hostile, start out of play.
    allies.slice((mission.allies || []).length).forEach(function (p) { M.park(p); });
    allies = allies.slice(0, (mission.allies || []).length);
    hostiles.forEach(function (p) { M.park(p); });

    /* What the end screen is made of. Carried across checkpoints: dying does not wipe the record. */
    var stats = { deaths: 0, ff: 0, skipped: 0, intel: 0, intelTotal: mission.intelTotal || 0, spawned: 0, killed: 0, t0: 0 };
    var stage = null;

    /* ---- what the match asks the director ---- */
    var step = null, stepIx = -1, stepT = 0, stepState = null;
    M.director = {
      // Where a bot wants to go. Allies stay with you; hostiles come for you, or hold.
      goalFor: function (p) {
        if (p.team === you.team) {
          if (!you.alive) return null;
          var k = allies.indexOf(p), ang = you.yaw + Math.PI + (k % 2 ? 0.7 : -0.7);
          return { x: you.pos.x + Math.sin(ang) * 3.2, z: you.pos.z + Math.cos(ang) * 3.2 };
        }
        if (p._hold) return { x: p._hold.x + (Math.random() - 0.5) * 4, z: p._hold.z + (Math.random() - 0.5) * 4 };
        return { x: you.pos.x, z: you.pos.z };
      },
      /* Hostiles never come back by themselves -- the director says who is in play -- and neither do
         you (that is the checkpoint). A squadmate who goes down is back on their feet beside you a
         few seconds later: the squad is the story's, not the score's. */
      noRespawn: function (p) { return p === you || p.team !== you.team; },
      onFriendlyFire: function (from, to) { if (from === you) friendlyFire(to); },
      shotRay: function (from, dir, maxD) { if (stage) stage.shotRay(from, dir, maxD); },
      spawnFor: function (p) {
        if (p.team !== you.team || p === you || !you.alive) return null;
        var a = you.yaw + Math.PI + (Math.random() - 0.5);
        return { at: [you.pos.x + Math.sin(a) * 4, you.pos.y, you.pos.z + Math.cos(a) * 4], yaw: you.yaw };
      },
    };

    /* ---- speech ---- */
    var queue = [], speaking = null, speakEnd = 0, silenceUntil = 0;
    // Speech keeps the wall clock, not the match's: it has to stay with the voice whatever the frame rate.
    var clock = function () { return (W.performance ? W.performance.now() : Date.now()) / 1000; };
    function hush() { queue.length = 0; speaking = null; silenceUntil = 0; $('.sub').style.display = 'none'; }
    /* Who is speaking: a name from the mission's squad (byName), or -- for a mission with a cast
       (campaign-cast.js) -- a cast id. The face that says it is the cast member's extra if one is on
       the stage, else the ally in the match dressed as them. */
    var CAST = W.CAMPAIGN_CAST || {};
    function speakerOf(who) {
      var spec = CAST[who];
      var e = stage && stage.cast[who] && stage.cast[who].visible ? stage.cast[who] : null;
      var p = byName[who] || null;
      if (!p && spec) p = allies.filter(function (q) { return q.cast === who; })[0] || null;
      if (!p && spec && who === (mission.player && mission.player.cast)) p = you;
      var name = who === 'you' ? (you.name || 'You') : who === 'radio' ? 'Radio' : who === 'all' ? 'Everyone'
        : e ? e.name : spec ? spec.name.split(' ')[0] : who;
      var actor = e ? e.actor : p && p !== you && p.actor && !p.scripted ? p.actor : null;
      return { name: name, voice: (spec && spec.voice) || (p && p.voice) || {}, actor: actor };
    }
    function voiceOf(who, l) {
      if (who === 'radio') return { pitch: 118, rate: 5.4, tract: 0.9, volume: 0.75 };
      if (who === 'you') return { pitch: 100, rate: 5.4, volume: 0.8 };
      var v = speakerOf(who).voice;
      return { pitch: v.pitch || 100, rate: v.rate || 5.3, tract: v.tract || 1, volume: (l && l.volume) || (l && l.radio ? 0.7 : 0.85) };
    }
    function say(lines) { (lines || []).forEach(function (l) { queue.push(l); }); }
    function speakNext() {
      var l = queue.shift();
      if (!l) return;
      var V = voiceOf(l.who, l), dur = 0;
      try { if (game.audio && game.audio.speak) dur = game.audio.speak(l.text, V) || 0; } catch (e) { dur = 0; }
      if (!dur) { try { dur = game.audio.speakLength(l.text, V) || 0; } catch (e) { dur = 0; } }
      if (!dur) dur = 0.4 + l.text.length * 0.055;
      dur = Math.max(1.2, dur);
      speaking = l; speakEnd = clock() + dur; silenceUntil = speakEnd + (l.wait != null ? l.wait : 0.35);
      var sub = $('.sub');
      var who = speakerOf(l.who);
      sub.innerHTML = '<b>' + esc(who.name) + (l.radio ? ' (radio)' : '') + '</b>' + esc(l.text);
      sub.style.display = 'block';
      var f = who.actor && who.actor.face;
      if (f && f.say) f.say(l.text, { duration: dur, emotion: l.emotion || null, strength: 0.85 });
      // And whoever is listening looks at whoever is talking.
      if (who.actor) {
        allies.forEach(function (q) { if (q.actor !== who.actor && q.actor && q.actor.face) q.actor.face.lookAt(who.actor); });
        if (stage) for (var k in stage.cast) { var e = stage.cast[k]; if (e.visible && e.actor !== who.actor && e.actor.face) e.actor.face.lookAt(who.actor); }
      }
    }
    function tickSpeech() {
      if (speaking && clock() >= speakEnd) {
        $('.sub').style.display = 'none';
        speaking = null;
        allies.forEach(function (q) { if (q.actor && q.actor.face) q.actor.face.lookAt(null); });
        if (stage) for (var k in stage.cast) { var e = stage.cast[k]; if (e.actor.face) e.actor.face.lookAt(null); }
      }
      if (!speaking && queue.length && clock() >= silenceUntil) speakNext();
    }
    function talking() { return !!speaking || queue.length > 0; }
    function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    /* ---- hostiles ---- */
    var spawned = [];
    function spawnGroup(g) {
      var at = placeOf(M, g.at) || { x: 0, z: 0 }, n = g.count || 1, spread = g.spread != null ? g.spread : 3;
      for (var i = 0; i < n; i++) {
        var p = hostiles.filter(function (q) { return !q.alive && spawned.indexOf(q) < 0; })[0]
          || hostiles.filter(function (q) { return !q.alive; })[0];
        if (!p) return;
        var a = (i / Math.max(1, n)) * Math.PI * 2 + Math.random() * 0.6, r = n > 1 ? spread * (0.4 + Math.random() * 0.6) : 0;
        if (g.skill != null && W.MP_DATA && W.MP_DATA.BOT_SKILL) p.skill = W.MP_DATA.BOT_SKILL[Math.max(0, Math.min(W.MP_DATA.BOT_SKILL.length - 1, g.skill))];
        p._hold = g.hold ? placeOf(M, g.hold) : null;
        M.spawnAt(p, [at.x + Math.cos(a) * r, at.z + Math.sin(a) * r], Math.atan2(you.pos.x - at.x, you.pos.z - at.z));
        if (spawned.indexOf(p) < 0) spawned.push(p);
        stats.spawned++;
        p._counted = false;
      }
    }
    /* Every hostile who goes down is counted once, whoever shot him. */
    function countKills() {
      hostiles.forEach(function (q) {
        if (q.alive) { q._seenAlive = true; return; }
        if (q._seenAlive && !q._counted && q.dyingAt) { q._counted = true; stats.killed++; }
        q._seenAlive = false;
      });
    }
    function hostilesAlive() { return hostiles.filter(function (q) { return q.alive; }).length; }

    /* ---- the objective on screen, and the marker in the world ---- */
    function setObjective(text, place) {
      $('.obj .t').textContent = text || '';
      $('.obj').style.display = text ? 'block' : 'none';
      self.markAt = place || null;
      $('.mark span').textContent = '';
    }
    function setProgress(f) {
      var bar = $('.obj .p');
      if (f == null) { bar.style.display = 'none'; return; }
      bar.style.display = 'block';
      bar.firstChild.style.width = Math.round(Math.max(0, Math.min(1, f)) * 100) + '%';
    }
    function tickMarker() {
      var mk = $('.mark');
      if (!self.markAt || !you.alive || api.cinematic) { mk.style.display = 'none'; return; }
      var y = M.groundAt ? (M.groundAt(self.markAt.x, self.markAt.z) || 0) + 1.2 : 1.2;
      var s = project(self.markAt.x, y, self.markAt.z);
      if (!s) { mk.style.display = 'none'; return; }
      mk.style.display = 'block';
      mk.style.left = Math.max(20, Math.min(W.innerWidth - 20, s.x)) + 'px';
      mk.style.top = Math.max(20, Math.min(W.innerHeight - 20, s.y)) + 'px';
      $('.mark span').textContent = Math.round(Math.hypot(self.markAt.x - you.pos.x, self.markAt.z - you.pos.z)) + ' m';
    }
    // World to screen with the camera as it stands: the view from yaw and pitch, the lens from the fov.
    function project(x, y, z) {
      var cam = game.camera, p = cam.position, t = cam.target || cam.lookAt || null;
      var yaw = api.yaw, pitch = api.pitch;
      var fx = Math.sin(yaw) * Math.cos(pitch), fy = -Math.sin(pitch), fz = Math.cos(yaw) * Math.cos(pitch);
      if (t && t.x !== undefined) { fx = t.x - p.x; fy = t.y - p.y; fz = t.z - p.z; var l = Math.hypot(fx, fy, fz) || 1; fx /= l; fy /= l; fz /= l; }
      var rx = fz, rz = -fx, rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;      // right, in the ground plane
      var ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                        // up = right x forward
      var dx = x - p.x, dy = y - p.y, dz = z - p.z;
      var cz = dx * fx + dy * fy + dz * fz;
      if (cz < 0.2) return null;
      var cx = dx * rx + dz * rz, cy = dx * ux + dy * uy + dz * uz;
      var f = 1 / Math.tan((cam.fov || 0.96) / 2), asp = W.innerWidth / Math.max(1, W.innerHeight);
      // The camera's right hand is at -X in this game (see RIGHT in mp-match), hence the minus.
      return { x: W.innerWidth / 2 * (1 - (cx / cz) * f / asp), y: W.innerHeight / 2 * (1 - (cy / cz) * f) };
    }

    /* ---- cutscenes ---- */
    function cutscene(shots) {
      var i = 0, t = 0;
      $('.bars').style.display = 'block';
      if (mpui) mpui.classList.add('cine');
      api.lockControls(true);
      var groundY = function (pl) { return M.groundAt ? (M.groundAt(pl.x, pl.z) || 0) : 0; };
      var last = null;
      api.cinematic = function (dt) {
        var sh = shots[i];
        // Past the last shot the camera holds where it ended until the lines are said.
        if (!sh) { if (stepState) stepState.camDone = true; return last; }
        t += dt;
        var u = Math.min(1, t / (sh.seconds || 3)), e = u * u * (3 - 2 * u);
        var a = placeOf(M, sh.from), b = placeOf(M, sh.to || sh.from), L = placeOf(M, sh.look), L2 = placeOf(M, sh.lookTo || sh.look);
        var h = sh.height != null ? sh.height : 2.2;
        var ex = a.x + (b.x - a.x) * e, ez = a.z + (b.z - a.z) * e;
        var ey = (a.y != null ? a.y : groundY(a) + h) * (1 - e) + (b.y != null ? b.y : groundY(b) + h) * e;
        var lx = L.x + (L2.x - L.x) * e, lz = L.z + (L2.z - L.z) * e, ly = groundY({ x: lx, z: lz }) + 1.2;
        if (u >= 1) { i++; t = 0; }
        last = { eye: [ex, ey, ez], at: [lx, ly, lz], fov: sh.fov || 50 };
        return last;
      };
    }
    function endCutscene() {
      api.cinematic = null;
      api.lockControls(false);
      $('.bars').style.display = 'none';
      if (mpui) mpui.classList.remove('cine');
    }

    /* ---- the steps ---- */
    function begin(ix) {
      stepIx = ix; step = mission.steps[ix]; stepT = 0; stepState = {};
      if (!step) return complete();
      if (step.checkpoint) {
        save.progress = save.progress || {};
        save.progress[mission.id] = { step: ix, at: { x: you.pos.x, y: you.pos.y, z: you.pos.z } };
        writeSave(save);
      }
      setProgress(null);
      setObjective(step.objective, step.at ? placeOf(M, step.at) : null);
      say(step.say);
      if (step.type === 'eliminate') (step.spawn || []).forEach(spawnGroup);
      if (step.type === 'cutscene') { cutscene(step.shots || []); say(step.lines); setObjective(null); }
      if (step.type === 'talk') { say(step.lines); setObjective(null); }
      if (step.type === 'scene' || step.type === 'play') runScript();
      if (opts.onStep) opts.onStep(step, ix);
    }
    /* A SCENE or a PLAY step is a generator over the stage (campaign-stage.js). A scene has the
       camera and the controls; a play step leaves you playing while it runs. */
    function runScript() {
      if (!stage) { stepState.gen = null; return; }
      stage.ctx.stepIx = stepIx;
      if (step.type === 'scene') {
        $('.bars').style.display = step.bars === false ? 'none' : 'block';
        if (mpui) mpui.classList.add('cine');
        api.lockControls(true);
        setObjective(null);
      } else {
        stage.releaseCamera();
        $('.bars').style.display = 'none';
        if (mpui) mpui.classList.remove('cine');
        api.lockControls(false);
      }
      stepState.gen = step.run.call(step, stage, stepState);
      stepState.wait = null;
    }
    function stepScript() {
      var g = stepState.gen;
      if (!g) return true;
      for (var guard = 0; guard < 50; guard++) {
        if (stepState.wait && !stepState.wait()) return false;
        var r = g.next();
        if (r.done) return true;
        stepState.wait = typeof r.value === 'function' ? r.value : null;
      }
      return false;
    }
    function endScene() {
      $('.bars').style.display = 'none';
      if (mpui) mpui.classList.remove('cine');
      api.lockControls(false);
      if (stage) stage.releaseCamera();
    }
    function finishStep() {
      if (step.type === 'cutscene') endCutscene();
      if (step.type === 'scene') endScene();
      say(step.done);
      setProgress(null);
      $('.prompt').style.display = 'none';
      begin(stepIx + 1);
    }
    function wavesTick() {
      var w = step.waves || [];
      stepState.fired = stepState.fired || {};
      for (var i = 0; i < w.length; i++) {
        if (!stepState.fired[i] && stepT >= (w[i].delay || 0)) { stepState.fired[i] = true; (w[i].spawn || []).forEach(spawnGroup); }
      }
    }
    function near(place, r) { return place && Math.hypot(you.pos.x - place.x, you.pos.z - place.z) <= (r || 4); }

    function tickStep(dt) {
      if (!step) return;
      stepT += dt;
      switch (step.type) {
        case 'reach':
          if (near(placeOf(M, step.at), step.r)) finishStep();
          break;
        case 'eliminate':
          if (stepT > 0.5 && hostilesAlive() === 0) finishStep();
          break;
        case 'defend': {
          wavesTick();
          var inside = near(placeOf(M, step.at), step.r || 10);
          stepState.held = (stepState.held || 0) + (inside ? dt : 0);
          setProgress(stepState.held / (step.seconds || 30));
          $('.prompt').style.display = inside ? 'none' : 'block';
          $('.prompt').textContent = inside ? '' : 'Get back to the area';
          if (stepState.held >= (step.seconds || 30) && hostilesAlive() === 0) finishStep();
          else if (stepState.held >= (step.seconds || 30)) setObjective('Finish off the last of them');
          break;
        }
        case 'survive':
          wavesTick();
          setProgress(stepT / (step.seconds || 30));
          if (stepT >= (step.seconds || 30)) finishStep();
          break;
        case 'interact': {
          var here = near(placeOf(M, step.at), step.r || 2.2);
          var pr = $('.prompt');
          pr.style.display = here ? 'block' : 'none';
          pr.textContent = step.prompt || 'Hold F';
          stepState.t = here && api.interactHeld && api.interactHeld() ? (stepState.t || 0) + dt : 0;
          setProgress(stepState.t ? stepState.t / (step.seconds || 2) : null);
          if (stepState.t >= (step.seconds || 2)) finishStep();
          break;
        }
        case 'talk':
          if (stepT > 0.2 && !talking()) finishStep();
          break;
        case 'cutscene':
          if (api.skipHeld && api.skipHeld() && stepT > 0.6) { hush(); finishStep(); }
          else if ((stepState.camDone || !(step.shots && step.shots.length)) && !talking()) finishStep();
          break;
        case 'wait':
          if (stepT >= (step.seconds || 1)) finishStep();
          break;
        case 'scene':
          if (step.skippable !== false && api.skipHeld && api.skipHeld() && stepT > 0.8) {
            hush(); stats.skipped++;
            if (step.skip) step.skip.call(step, stage, stepState);
            finishStep();
          } else if (stepScript()) finishStep();
          break;
        case 'play':
          if (stepScript()) finishStep();
          break;
        default:
          finishStep();
      }
    }

    /* ---- dying, and the checkpoint ---- */
    var deadAt = 0;
    function tickDeath() {
      if (you.alive) { deadAt = 0; return; }
      if (!deadAt) { deadAt = M.time; stats.deaths++; card('Killed in action', mission.title, ['Back to the last checkpoint...'], null); return; }
      if (M.time - deadAt > 3.2) restartCheckpoint();
    }
    function restartCheckpoint() {
      hideCard();
      var pr = save.progress && save.progress[mission.id];
      var ix = pr ? pr.step : 0;
      var at = pr && pr.at ? pr.at : placeOf(M, 'spawnA:2');
      hostiles.forEach(function (p) { M.park(p); p.puppet = false; });
      spawned.length = 0;
      hush();
      if (step && step.type === 'scene') endScene();
      M.spawnAt(you, at.y != null ? [at.x, at.y, at.z] : [at.x, at.z], you.yaw);
      allies.forEach(function (p, k) { M.spawnAt(p, at.y != null ? [at.x + (k ? 2 : -2), at.y, at.z - 2] : [at.x + (k ? 2 : -2), at.z - 2], you.yaw); });
      deadAt = 0;
      begin(ix);
    }

    /* ---- friendly fire: not tolerated ----
       Black, the words, and back to the last checkpoint. Counted against the stars. */
    var ffUntil = 0;
    function friendlyFire(who) {
      if (ffUntil || done || !started) return;
      stats.ff++;
      ffUntil = clock() + 3.4;
      hush();
      api.lockControls(true);
      var el = stage ? stage.$('.ff') : null;
      if (el) {
        el.innerHTML = '<div class="h">Friendly fire will not be tolerated</div><div class="s">Returning to the last checkpoint</div>';
        el.style.display = 'flex';
      } else card('Friendly fire', 'Will not be tolerated', ['Back to the last checkpoint...'], null);
    }
    function tickFriendlyFire() {
      if (!ffUntil || clock() < ffUntil) return !!ffUntil;
      ffUntil = 0;
      if (stage) stage.$('.ff').style.display = 'none';
      api.lockControls(false);
      restartCheckpoint();
      return false;
    }

    /* ---- the stage, for missions that have a cast ---- */
    if (W.CAMPAIGN_STAGE && (mission.setup || mission.steps.some(function (s) { return s.type === 'scene' || s.type === 'play'; }))) {
      stage = new W.CAMPAIGN_STAGE.Stage({
        api: api, M: M, game: game, mission: mission, allies: allies, hostiles: hostiles, stats: stats,
        say: function (l) { say(l); }, hush: hush, talking: talking,
        objective: function (t, place) { setObjective(t, place ? placeOf(M, place) : null); },
        progress: function (f) { setProgress(f); },
        prompt: function (t) { var pr = $('.prompt'); pr.style.display = t ? 'block' : 'none'; pr.textContent = t || ''; },
        spawn: function (g) { spawnGroup(g); },
        hostilesAlive: function () { return hostilesAlive(); },
        friendlyFire: function () { friendlyFire(); },
        hudShake: function (k) { if (hud && hud.shake) hud.shake(k); },
        placeOf: function (a) { return placeOf(M, a); },
      });
      self.stage = stage;
      if (mission.setup) mission.setup(stage);
    }
    var hud = opts.hud || null;

    /* ---- cards: briefing, death, debrief ---- */
    function card(kicker, head, lines, buttons, sub) {
      var c = $('.card');
      c.innerHTML = '<div class="k">' + esc(kicker) + '</div><div class="h">' + esc(head) + '</div>'
        + (sub ? '<div class="s">' + esc(sub) + '</div>' : '')
        + (lines && lines.length ? '<ul>' + lines.map(function (l) { return '<li>' + esc(l) + '</li>'; }).join('') + '</ul>' : '')
        + '<div class="b"></div>';
      (buttons || []).forEach(function (b) {
        var el = document.createElement('button');
        el.textContent = b.label; el.addEventListener('click', b.go);
        c.querySelector('.b').appendChild(el);
      });
      c.style.display = 'flex';
    }
    function hideCard() { $('.card').style.display = 'none'; }

    var started = false, done = false, kills0 = you.kills || 0, t0 = 0;
    function briefing() {
      api.lockControls(true);
      // A mission that opens on its own cutscene goes straight in.
      if (mission.noBriefing) { setTimeout(start, 0); return; }
      var objectives = mission.steps.filter(function (s) { return s.objective && s.type !== 'cutscene'; }).map(function (s) { return s.objective; });
      card('Mission ' + (opts.index != null ? opts.index + 1 : ''), mission.title, objectives, [
        { label: 'Begin', go: start },
      ], mission.place);
      say(mission.briefing);
    }
    function start() {
      if (started) return;
      started = true;
      hideCard();
      api.lockControls(false);
      hush();
      t0 = M.time; stats.t0 = M.time;
      var pr = save.progress && save.progress[mission.id];
      if (opts.startAt != null) begin(opts.startAt);
      else if (pr && opts.resume !== false && pr.step > 0) {
        var at3 = function (dx, dz) { return pr.at.y != null ? [pr.at.x + dx, pr.at.y, pr.at.z + dz] : [pr.at.x + dx, pr.at.z + dz]; };
        M.spawnAt(you, at3(0, 0), you.yaw);
        allies.forEach(function (p, k) { M.spawnAt(p, at3(k ? 2 : -2, -2), you.yaw); });
        begin(pr.step);
      } else begin(0);
    }
    function complete() {
      done = true;
      setObjective(null);
      say(mission.debrief);
      save.done = save.done || {};
      save.done[mission.id] = { at: Date.now(), time: Math.round(M.time - t0), kills: (you.kills || 0) - kills0 };
      if (save.progress) delete save.progress[mission.id];
      writeSave(save);
      if (stage && mission.passed) {
        api.lockControls(true);
        var r = mission.passed(stats, stage);
        r.title = mission.title;
        r.onRestart = function () {
          var sv = loadSave(); if (sv.progress) delete sv.progress[mission.id]; writeSave(sv);
          W.location.href = W.location.pathname + '?mission=' + mission.id + '&fresh=1';
        };
        r.onNext = function () { if (opts.onNext) opts.onNext(); };
        r.onMenu = function () { if (opts.onMenu) opts.onMenu(); else W.location.href = 'campaign.html'; };
        save.done[mission.id].stars = r.stars; save.done[mission.id].pct = r.pct; writeSave(save);
        stage.passed(r);
        self.result = r;
        return;
      }
      setTimeout(function () {
        api.lockControls(true);
        var mins = Math.floor((M.time - t0) / 60), secs = Math.round((M.time - t0) % 60);
        card('Mission complete', mission.title, [
          'Time ' + mins + ':' + (secs < 10 ? '0' : '') + secs,
          'Hostiles killed ' + ((you.kills || 0) - kills0),
        ], [
          { label: opts.next ? 'Next mission' : 'Campaign', go: function () { if (opts.onNext) opts.onNext(); } },
          { label: 'Replay', go: function () { W.location.reload(); } },
        ]);
      }, 2500);
    }

    /* ---- the tick, run after the match's own ---- */
    this.tick = function (dt) {
      tickSpeech();
      if (stage) stage.tick(dt);
      if (!started || done) { tickMarker(); return; }
      if (tickFriendlyFire()) return;
      countKills();
      tickDeath();
      if (you.alive) tickStep(dt);
      tickMarker();
    };
    this.stats = stats;
    this.begin = begin;
    this.say = say;
    this.restartCheckpoint = restartCheckpoint;
    this.state = function () {
      return { step: stepIx, id: step && step.id, type: step && step.type, objective: step && step.objective, alive: hostilesAlive(), speaking: speaking && speaking.text, queue: queue.length, started: started, done: done, stats: stats };
    };
    this.start = start;
    briefing();
  }

  /* Build the match for a mission and put a director on it. */
  function play(mission, opts) {
    opts = opts || {};
    var squad = (mission.allies || []).length;
    var pool = Math.max(4, Math.min(11, mission.enemies || 6));
    var teamSize = Math.max(squad + 1, pool);
    var roster = [];
    // Index 0 is you; the match deals odd indices to side b and even to side a.
    for (var i = 1; i < teamSize * 2; i++) {
      var team = (i % 2) ? 'b' : 'a';
      if (team === 'a') {
        var a = (mission.allies || [])[(i / 2 | 0) - 1] || null;
        roster[i] = a ? { name: a.name, operator: a.operator, cast: a.cast, loadout: a.loadout } : {};
      } else {
        // Hostiles in a mission with a cast are dealt its enemy looks round-robin.
        var looks = mission.hostileCast || null;
        var k = (i - 1) / 2 | 0, los = mission.hostileLoadouts;
        roster[i] = looks ? { cast: looks[k % looks.length], loadout: los ? los[k % los.length] : undefined } : {};
      }
    }
    var director = null;
    var api = W.MP_GAME.start({
      canvas: opts.canvas || '#game',
      mapId: mission.map,
      modeDef: { id: 'story', name: 'Campaign', short: 'Story', score: Infinity, minutes: Infinity, respawn: false, story: true,
        friendlyFire: !!mission.friendlyFire },
      teamSize: teamSize,
      roster: roster,
      operator: (mission.player && mission.player.operator) || 'delta',
      loadout: (mission.player && mission.player.loadout) || opts.loadout || null,
      name: opts.name || (mission.player && mission.player.name) || 'You',
      cast: (mission.player && mission.player.cast) || null,
      story: true,
      timeOfDay: mission.time,
      onReady: function (apiReady, M, game, hud) {
        opts.hud = hud;
        director = new Director(apiReady, M, game, mission, opts);
        W.CAMPAIGN_LIVE = director;
        return function (dt) { director.tick(dt); };
      },
    });
    return api;
  }

  W.CAMPAIGN = { play: play, Director: Director, placeOf: placeOf, loadSave: loadSave, writeSave: writeSave, SAVE_KEY: SAVE_KEY };
})();
