// Robbing a store. Point a gun at whoever's behind the counter and hold it there: most put their
// hands up and empty the register for you; some reach under the counter instead and come up with a
// shotgun. How likely depends on the store (a gun shop almost always fights back), where it is
// (country stores more than city ones) and the hour (late at night clerks are jumpier). Let the gun
// drop before they've handed it over and they hit the panic button. Either way the police are told
// (two stars), and a store you've robbed has nothing left in the register until tomorrow.
import { regionAt } from '../world/layout.js';

const COMPLY = ['"Okay, okay! Don\'t shoot!"', '"Easy! Take whatever you want!"', '"Please — I\'ve got kids!"', '"It\'s yours, it\'s yours! Just stay calm!"'];
const FIGHT = ['"Not in my store!"', '"Wrong store, pal."', '"I\'ve been waiting for somebody like you."', '"Get the hell out!"'];
const HANDOVER = ['"Here — that\'s all of it!"', '"Take it and go!"', '"That\'s everything, I swear!"'];
const AGAIN = ['"Again?! There\'s nothing left!"', '"You already cleaned me out!"'];
const pick = (a) => a[(Math.random() * a.length) | 0];

export function installRobbery(game) {
  const { player, hud, peds, combat, S } = game;
  const keepers = (game.storeKeepers = game.storeKeepers || []);
  let active = null; // { k, state, t, lowered }

  const armedChance = (k) => {
    if (k.kind === 'guns') return 0.85;
    const reg = regionAt(k.h.root.position.x, k.h.root.position.z), country = reg.sub !== 'City';
    const h = game.sky.hour, late = h < 6 || h > 21;
    return (k.kind === 'bar' ? 0.35 : k.kind === 'mart' ? 0.25 : 0.12) + (country ? 0.15 : 0) + (late ? 0.12 : 0); // (a bartender keeps something under the bar)
  };
  const take = (k) => Math.round((k.kind === 'guns' ? 300 + Math.random() * 600 : k.kind === 'clothes' ? 150 + Math.random() * 450 : 60 + Math.random() * 220));
  // is the player holding a gun on this keeper?
  const aimedAt = (k) => {
    if (S.mode !== 'foot' || !player.aiming || !combat.drawn || combat.def?.melee || S.dead > 0) return false;
    const kp = k.h.root.position, dx = kp.x - player.pos.x, dz = kp.z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > 9 || d < 0.5) return false;
    const off = Math.atan2(Math.sin(Math.atan2(dx, dz) - player.heading), Math.cos(Math.atan2(dx, dz) - player.heading));
    return Math.abs(off) < Math.max(0.12, 0.6 / d);
  };
  const calls = []; // phone calls to the police still to be made (they're made even if you've left)
  const callCops = (k, delay) => { calls.push({ k, t: delay }); };

  function fight(k) {
    // the clerk becomes a person in the world (who can be shot) with a shotgun
    k.taken = true;
    const pos = k.h.root.position.clone();
    k.h.root.parent?.remove(k.h.root); k.h.freeGpu?.();
    for (const a of k.h.acc || []) a.visible = false; // (hats and glasses only follow the head in the shop)
    const p = peds.spawnAt(pos.x, pos.z, null, k.h);
    if (!p) return;
    p.heading = k.h.root.rotation.y; p.keeperOf = k;
    game.armAndFight?.(p, k.kind === 'guns' && Math.random() < 0.5 ? 'rifle_01' : 'shotgun_01');
    hud.toast(pick(FIGHT), 2.5);
    callCops(k, 4);
  }

  return {
    update(dt) {
      // a store keeps quiet for a moment, then phones it in (or the alarm company does)
      for (let i = calls.length - 1; i >= 0; i--) if ((calls[i].t -= dt) <= 0) {
        const k = calls[i].k; calls.splice(i, 1);
        game.police?.crime('robbery');
        hud.toast(k.taken ? 'Someone called in the shooting at the store.' : 'The clerk is on the phone with the police.', 2.5);
      }
      // a new day: a killed or hurt clerk is replaced, the till is full again
      for (const k of keepers) if (k.robbedDay !== undefined && k.robbedDay !== game.sky.day) { k.robbedDay = undefined; if (k.taken && k.revive) { k.revive(); k.taken = false; } }
      if (!active) {
        for (const k of keepers) {
          if (k.taken || !k.h.root.visible || !aimedAt(k)) continue;
          active = { k, state: 'aim', t: 0, lowered: 0 };
          break;
        }
        return;
      }
      const a = active, k = a.k;
      a.t += dt;
      const aimed = !k.taken && aimedAt(k);
      if (a.state === 'aim') {
        if (!aimed) { active = null; return; }
        if (a.t < 0.45) return;
        if (k.robbedDay === game.sky.day) { hud.toast(pick(AGAIN), 2.2); k.h.play('Crouch_Idle_Loop', 0.2); a.state = 'done'; a.t = 0; return; }
        const roll = game.robberyForce ? (game.robberyForce === 'fight' ? 0 : 1) : Math.random(); // (tests can force it)
        game.peds.panic(k.h.root.position.clone(), 30, { cover: true }); // (a keeper has no .pos: that threw on every hold-up) // a gun on the clerk: customers and passers-by get down (R1)
        if (roll < armedChance(k)) { a.state = 'fight'; fight(k); active = null; return; }
        a.state = 'comply'; a.t = 0;
        hud.toast(pick(COMPLY), 2.5);
        k.h.play('Interact', 0.2, 0.8); // into the register
        return;
      }
      if (a.state === 'comply') {
        if (!aimed) {
          a.lowered += dt;
          if (a.lowered > 1.5) { // they hit the panic button under the counter
            if (a.bag) { a.bag.who.release(); a.bag = null; }
            hud.toast('The clerk hits the panic button!', 2.5); game.audio?.alarm?.(0.8);
            k.robbedDay = game.sky.day; callCops(k, 0.5); k.h.play('Crouch_Idle_Loop', 0.2); a.state = 'done'; a.t = 0;
          }
          return;
        }
        a.lowered = 0;
        if (a.t > 1.2 && a.t - dt <= 1.2) k.h.play('Interact', 0.2, 0.8);
        // (A2) the bag comes up from behind the counter and is held out to you, arms shaking
        if (a.t > 3.8 && !a.bag && game.acts && !k.taken) {
          const A = game.acts, who = A.fromHuman(k.h), bag = A.prop('bag');
          who.hold(bag, true); k.h.play('Idle_Loop', 0.2);
          who.ik = (F, P) => { const to = player.pos.clone(); to.y = F.chest.y - 0.15; const at = F.chest.clone().addScaledVector(F.fw, 0.32).addScaledVector(F.up, -0.1).lerp(to, 0.18); at.x += Math.sin(a.t * 37) * 0.008; A.carry(P, F, bag, true, 0.3, 0.12, at); };
          a.bag = { who, bag };
        }
        if (a.t > (a.bag ? 5.2 : 3.8)) {
          if (a.bag) { a.bag.who.release(); a.bag = null; } // (you snatch it)
          const cash = take(k);
          S.money += cash;
          hud.toast(`${pick(HANDOVER)}  +$${cash}`, 2.8);
          k.robbedDay = game.sky.day;
          k.h.play('Crouch_Idle_Loop', 0.25);
          callCops(k, 6);
          game.reportCrime?.('robbery', k.h.root.position.clone());
          a.state = 'done'; a.t = 0;
        }
        return;
      }
      if (a.state === 'done' && a.t > 8) { if (!k.taken) k.h.play('Idle_Loop', 0.4); active = null; }
    },
    get active() { return active && { kind: active.k.kind, state: active.state }; },
  };
}
