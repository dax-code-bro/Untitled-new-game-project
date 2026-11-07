// The Gulf Line defends its hill. Lead armed enemies (a rival crew, raiders, bounty hunters, a
// mission's gunmen, or the police once they're shooting) up to the hideout and the crew takes them
// on: up to eight of them pull a gun (each their own: Rico's revolver, Big O's shotgun, Tina's rifle
// ...), turn on the nearest threat and fire; the rest get down. Raiders and gunmen shoot back at the
// crew as well as at you. A crew member who's hit badly goes down wounded (never dies: Marisol
// patches them up after), and when it's quiet again everyone puts the guns away.
import * as THREE from 'three';
import { GunPose } from '../entities/gunpose.js';
import { buildWeaponModel, WEAPONS } from '../entities/arsenal.js';

const R_THREAT = 90, R_FIRE = 80, MAX_FIGHTERS = 8;
// who carries what (the rest: the 9mm)
const ARMS = { rico: 'magnum', 'big-o': 'shotgun_01', tina: 'rifle_01', smoke: 'rifle_01', jayden: 'marksman_01', deshawn: 'shotgun_01', sofia: 'pistol', lalo: 'pistol', mateo: 'pistol', cap: 'shotgun_01' };
const NONCOMBAT = new Set(['hector', 'marisol', 'nina', 'vera']); // they get down and stay down
const LINES = {
  start: ['They followed you up here! Guns up!', 'Company on the hill! Everybody up!', 'You brought a war home. Fine. Light them up!'],
  cops: ['Cops on the hill! Hold them off!', 'Badges coming up the road! Nobody gets taken!'],
  end: ['That\'s what happens when you come up this hill.', 'Clear. Somebody check on everybody.', 'Quiet again. Don\'t make a habit of this.'],
};

export function installDefense(game) {
  const { peds, police, hud, career } = game;
  let fight = null;
  const pick = (a) => a[(Math.random() * a.length) | 0];
  const say = (who, line) => (game.law?.say ? game.law.say(who, line, 3) : hud.toast(`${who}: ${line}`, 3));
  const flashMat = new THREE.SpriteMaterial({ color: 0xffd28a, transparent: true, opacity: 0.95, depthWrite: false, blending: THREE.AdditiveBlending });
  const magnum = Object.values(WEAPONS).find((w) => w.cat === 'pistol' && w.platform === 'magnum')?.id || 'pistol';
  const weaponId = (id) => { const w = ARMS[id] === 'magnum' ? magnum : ARMS[id] || 'pistol'; return WEAPONS[w] ? w : 'pistol'; };

  const hostileNear = (HQ) => peds.list.filter((p) => p.mode !== 'dead' && (p.role === 'foe' || p.foe || (p.role === 'armedciv' && p.mode === 'fight') || (p.role === 'cop' && police.wanted >= 2))
    && Math.hypot(p.pos.x - HQ.x, p.pos.z - HQ.z) < R_THREAT);

  function start(G, hostiles) {
    const crew = G.crew.filter((m) => m.h.root.visible && !m.away);
    if (!crew.length) return;
    const cops = hostiles.every((p) => p.role === 'cop');
    const fighters = crew.filter((m) => !NONCOMBAT.has(m.M.id)).slice(0, MAX_FIGHTERS);
    fight = { G, t: 0, quiet: 0, cops, crew, fighters, down: 0 };
    for (const m of crew) {
      if (!fighters.includes(m)) { m.fightHeading = null; m.h.play('Crouch_Idle_Loop', 0.25); m.taking = true; continue; }
      const id = weaponId(m.M.id);
      m.def = m.def || {};
      m.def.hp = 100; m.def.down = false; m.def.shotT = 0.6 + Math.random(); m.def.id = id;
      if (!m.def.gun || m.def.gunId !== id) { if (m.def.gun) game.scene.remove(m.def.gun); m.def.gun = buildWeaponModel(WEAPONS[id]); m.def.gunId = id; game.scene.add(m.def.gun); }
      m.def.gun.visible = true;
      m.def.pose = m.def.pose || new GunPose(m.h);
      m.fight = (dt) => poseFighter(m, dt);
    }
    const who = crew.find((m) => m.M.id === 'rico') || crew[0];
    say(who.M.name.split(' ')[0].replace(/"/g, ''), pick(cops ? LINES.cops : LINES.start));
  }

  function end() {
    const f = fight; fight = null;
    for (const m of f.crew) {
      m.fight = null; m.fightHeading = null; m.taking = false;
      if (m.def?.gun) m.def.gun.visible = false;
      if (m.def) { m.def.down = false; m.def.hp = 100; }
      m.h.play(m.pose || 'Idle_Loop', 0.4);
    }
    const who = f.crew.find((m) => m.M.id === 'rico') || f.crew[0];
    if (who) say(who.M.name.split(' ')[0].replace(/"/g, ''), pick(LINES.end));
    if (f.down) setTimeout(() => say('Marisol', f.down > 1 ? 'Everybody who\'s bleeding, over here. Now.' : 'Hold still, it went through. You\'ll live.'), 3500);
    const P = career.p; P.hideout = P.hideout || {}; P.hideout.defended = (P.hideout.defended || 0) + 1; career.saveSoon();
  }

  // after the clip: face the target, gun up, both hands on it
  function poseFighter(m, dt) {
    const d = m.def; if (!d || d.down || !d.aim) return;
    m.h.root.updateMatrixWorld(true);
    const info = d.gun.userData.hold;
    if (info) d.pose.apply({ gun: d.gun, info, state: 'aim', aimDir: d.aim, heading: m.h.root.rotation.y });
    if (d.flash) {
      d.flash.t -= dt;
      if (d.flash.t <= 0) { game.scene.remove(d.flash); d.flash = null; }
      else if (d.gun.userData.muzzle) d.flash.position.copy(d.gun.localToWorld(d.gun.userData.muzzle.clone()));
    }
  }

  // the raiders' side: a gunman aims at whoever's closer, you or a crew member standing in the open
  game.defense = {
    active: () => !!fight,
    targetFor(p) {
      if (!fight) return null;
      let best = null, bd = Math.hypot(game.player.pos.x - p.pos.x, game.player.pos.z - p.pos.z);
      for (const m of fight.fighters) { if (m.def?.down) continue; const dd = Math.hypot(m.pos.x - p.pos.x, m.pos.z - p.pos.z); if (dd < bd) { bd = dd; best = m; } }
      return best ? { pos: best.pos, hit: (n) => hurt(best, n) } : null;
    },
    stats: () => (fight ? { fighters: fight.fighters.length, down: fight.down, t: fight.t } : null),
  };
  function hurt(m, n) {
    const d = m.def; if (!d || d.down) return;
    d.hp -= n;
    m.h.flinch?.('torso', 'R', 0.8);
    if (d.hp <= 0) { d.down = true; d.gun.visible = false; m.fightHeading = null; m.h.play('Sitting_Idle_Loop', 0.3, 1, true); fight.down++; say(m.M.name.split(' ')[0].replace(/"/g, ''), pick(['I\'m hit! I\'m hit!', 'Ah! Keep going, I\'m fine!', 'They got me!'])); }
  }

  return {
    update(dt) {
      const G = game.gang; if (!G || !G.HQ) return;
      const hostiles = hostileNear(G.HQ);
      if (!fight) { if (hostiles.length && G.crew.some((m) => m.h.root.visible)) start(G, hostiles); return; }
      fight.t += dt;
      if (!hostiles.length) { if ((fight.quiet += dt) > 5) end(); return; }
      fight.quiet = 0;
      for (const m of fight.fighters) {
        const d = m.def; if (!d || d.down) continue;
        if (!m.h.root.visible) continue; // the player's walked off: they hold fire till you're back
        // the nearest threat in range
        let tgt = null, td = R_FIRE;
        for (const p of hostiles) { const dd = Math.hypot(p.pos.x - m.pos.x, p.pos.z - m.pos.z); if (dd < td) { td = dd; tgt = p; } }
        if (!tgt) { d.aim = null; m.fightHeading = null; continue; }
        d.aim = new THREE.Vector3(tgt.pos.x - m.pos.x, tgt.pos.y + 1.2 - (m.pos.y + 1.4), tgt.pos.z - m.pos.z).normalize();
        m.fightHeading = Math.atan2(d.aim.x, d.aim.z);
        const W = WEAPONS[d.id], long = W.cat !== 'pistol';
        if (m.h.locked <= 0) m.h.play(long ? 'Idle_Loop' : 'Pistol_Aim_Neutral', 0.15);
        if ((d.shotT -= dt) > 0) continue;
        const shotgun = /shotgun/.test(d.id);
        if (shotgun && td > 30) { d.shotT = 0.5; continue; } // a shotgun waits for them to come closer
        d.shotT = shotgun ? 1.0 + Math.random() * 0.5 : long ? 0.45 + Math.random() * 0.5 : 0.75 + Math.random() * 0.6;
        // the shot: a flash at the muzzle, the bang, and a hit or a miss
        if (!d.flash) { d.flash = new THREE.Sprite(flashMat); d.flash.scale.setScalar(0.28); game.scene.add(d.flash); }
        d.flash.t = 0.06;
        if (!long) m.h.play('Pistol_Shoot', 0.05, 1.4, true);
        const ear = Math.hypot(m.pos.x - game.camera.position.x, m.pos.z - game.camera.position.z);
        game.combat.audio?.gunshot(Math.max(0.15, 0.9 - ear / 120));
        const skill = (career.p.crew?.[m.M.id]?.skills?.shoot || 2) / 5;
        const chance = Math.max(0.08, (shotgun ? 0.8 - td / 30 : 0.55 - td / 140)) * (0.6 + skill * 0.6);
        if (Math.random() < chance) {
          const dmg = shotgun ? 45 : long ? 30 : 24;
          peds.damage(tgt, dmg, m.pos.clone(), { part: Math.random() < 0.15 ? 'head' : 'torso', side: Math.random() < 0.5 ? 'L' : 'R' });
        }
      }
    },
  };
}
