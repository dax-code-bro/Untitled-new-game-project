// Weapons, batch one: looking after them, and doing it quietly.
//  - Wear: every gun wears a little with each shot (cheap ones faster, more in the wet). A worn gun
//    can jam: a dead click and "Jammed". Reload (R) clears it.
//  - Cleaning: with a gun-cleaning kit (hardware store, Hunting) stand still with a worn gun and
//    press F; a few seconds' work and it's like new. Your guns' wear is saved.
//  - Takedowns: fists up or a blade out, come up behind someone who hasn't seen you and press F.
//    Fists knock them out cold (they drop, and come round half a minute later and run); a blade is
//    silent and final.
//  - (Suppressed shots only scare and alert the people close by: main.js uses the weapon's silent flag.)
import { WEAPONS } from '../entities/arsenal.js';
import { keyHint } from './world-util.js';

export function installGunwork(game) {
  const { combat, hud, player, peds, career, S } = game;
  const P = career.p;
  P.weapons = P.weapons || {};
  const cond = (P.weapons.cond = P.weapons.cond || {});
  const condOf = (id) => cond[id] ?? 1;
  const kitId = () => game.tools?.list?.find((t) => /gun cleaning kit/i.test(t.name))?.id;
  const hasKit = () => { const id = kitId(); return !!(id && P.tools?.[id]); };

  // ---- wear and jams, around the combat system's own firing and reloading
  const prevAttack = combat.attack.bind(combat);
  combat.attack = (...args) => {
    const id = combat.weapon, w = combat.def;
    if (!w.melee && combat.jammed) {
      const now = performance.now();
      if (now - (combat.clickAt || 0) > 450) { combat.clickAt = now; game.audio?.click?.(0.9); hud.toast(`Jammed — ${'R'} to clear`, 1.2); }
      return null;
    }
    const r = prevAttack(...args);
    if (r && !w.melee) {
      const cheap = (w.price || 500) < 600 ? 1.6 : 1;
      cond[id] = Math.max(0, condOf(id) - 0.0009 * cheap * (1 + (game.weather?.rain || 0) * 0.5));
      const c = cond[id];
      if (c < 0.55 && Math.random() < (0.55 - c) * 0.09) { combat.jammed = true; hud.toast('Jammed!', 1); }
      if (c < 0.35 && !combat.wornWarned) { combat.wornWarned = true; hud.toast(`Your ${w.name} needs cleaning`, 2.4); }
    }
    return r;
  };
  const prevReload = combat.reload.bind(combat);
  combat.reload = (...args) => {
    if (combat.jammed) { combat.jammed = false; combat.reloading = 0.7; combat.reloadDur = 0.7; hud.toast('Cleared the jam', 1); return true; }
    return prevReload(...args);
  };

  let cleaning = null, ko = [];
  const victim = () => {
    // someone right in front of you, facing away, who hasn't noticed you
    const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
    let best = null, bd = 1.5;
    for (const p of peds.list) {
      if (p.mode === 'dead' || p.mode === 'ko' || p.role === 'cop' || p.scripted || p.mode === 'flee' || p.h.ragdoll) continue;
      const dx = p.pos.x - player.pos.x, dz = p.pos.z - player.pos.z, d = Math.hypot(dx, dz);
      if (d > bd || d < 0.2) continue;
      if ((dx * fx + dz * fz) / d < 0.75) continue; // in front of you
      if ((Math.sin(p.heading) * dx + Math.cos(p.heading) * dz) / d < 0.5) continue; // and facing away
      best = p; bd = d;
    }
    return best;
  };

  return {
    condition: condOf,
    update(dt, a, free) {
      // the knocked out come round
      for (let i = ko.length - 1; i >= 0; i--) {
        const p = ko[i];
        if (p.mode !== 'ko' || !peds.list.includes(p)) { ko.splice(i, 1); continue; }
        if ((p.koT -= dt) <= 0) {
          p.h.endRagdoll?.(); p.mode = 'flee'; p.threat = player.pos.clone(); p.timer = 12; p.h.play('Idle_Loop', 0);
          ko.splice(i, 1);
        }
      }
      // cleaning a gun: crouched over it for a few seconds
      if (cleaning) {
        cleaning.t -= dt;
        if (cleaning.t <= 0 || S.mode !== 'foot' || S.dead > 0) {
          if (cleaning.t <= 0) { cond[cleaning.id] = 1; combat.jammed = false; combat.wornWarned = false; hud.toast(`${WEAPONS[cleaning.id]?.name || 'Gun'} cleaned and oiled`, 1.8); career.saveSoon?.(); }
          S.override = cleaning.prev; cleaning = null;
        }
        return '';
      }
      if (S.mode !== 'foot' || S.dead > 0 || S.indoors && false) return '';
      // a takedown from behind
      const melee = combat.def?.melee;
      if (melee && !player.aiming) {
        const p = victim();
        if (p) {
          const blade = combat.def.kind === 'blade';
          if (free && a.enter) {
            a.enter = false;
            player.h.play(blade ? 'Punch_Jab' : 'Punch_Cross', 0.05, 1.3, true);
            if (blade) peds.damage(p, 999, player.pos.clone(), { melee: true, part: 'torso', side: 'R' });
            else {
              p.mode = 'ko'; p.koT = 25 + Math.random() * 10; p.speed = 0;
              if (p.h.goLimp((x, z, y) => game.collision.surface(x, z, y))) {
                const T = p.h.ragdoll; const fx = Math.sin(player.heading), fz = Math.cos(player.heading);
                T.push(player.pos.clone().set(fx * 1.2, 0.3, fz * 1.2), null, null, 0.5); // pitched forward, away from you
              }
              ko.push(p);
              if (game.reportCrime) game.reportCrime('assault', p.pos.clone(), p);
            }
            return '';
          }
          const who = p.resident ? `${p.resident.first} ${p.resident.last}` : 'them';
          return `${keyHint(game)} ${blade ? 'take' : 'knock'} ${who} ${blade ? 'out — for good' : 'out'}`;
        }
      }
      // cleaning: still, a worn gun in your hands, the kit in your bag, nobody after you
      const id = combat.weapon, w = combat.def;
      if (!w?.melee && !combat.holstered && condOf(id) < 0.75 && hasKit() && player.speed < 0.3 && !(game.police?.wanted > 0)) {
        if (free && a.enter) {
          a.enter = false;
          cleaning = { id, t: 4, prev: S.override };
          S.override = { moveX: 0, moveY: 0, sprint: false, jump: false, aim: false, fire: false };
          player.h.play('Crouch_Idle_Loop', 0.2); player.h.locked = 4;
          hud.toast(`Cleaning the ${w.name}…`, 1.6);
          return '';
        }
        return `${keyHint(game)} clean your ${w.name} (${Math.round(condOf(id) * 100)}%)`;
      }
      return '';
    },
  };
}
