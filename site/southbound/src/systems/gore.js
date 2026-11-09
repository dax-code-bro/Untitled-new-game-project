// Blood and injuries (G13), wired to every hit: a person shot gets a bullet wound where the bullet
// landed (blood soaking out and running down) and spatter behind them on the ground or a wall behind;
// a knife leaves a cut, fists a bruise, a car scrapes and smears, a blast burns. The badly hurt drip a
// trail as they move; the dead and the dying bleed a pool that spreads. The player gets wounds too (on
// the side the shot came from, bruises from fists and falls) and they heal over game days. Settings >
// Content > "Blood & gore" off: none of it.
import * as THREE from 'three';
import { createBlood } from '../world/blood.js';
import { addWound, tickWounds, woundable } from '../entities/woundfx.js';

const HEAL_DAYS = [6, 3, 4, 3, 8]; // bullet, cut, bruise, scrape, burn
const PLAYER_BONES = /^(spine0[2-4]|upperarm01[LR]|lowerarm01[LR]|upperleg01[LR]|lowerleg01[LR])$/;

export function installGore(game) {
  const { peds, scene, collision, settings, S, player, camera, sky } = game;
  const blood = createBlood(scene, collision);
  game.blood = blood;
  game.woundfx = { addWound, woundable }; // (tests)
  const on = () => settings.gore !== false;
  const wounded = new Set(); // people (and the player) with wounds to keep ticking
  const _c = new THREE.Vector3();
  const nearCam = (p, r = 70) => { _c.setFromMatrixPosition(camera.matrixWorld); return _c.distanceTo(p) < r; };
  const kindOf = (info) => (!info ? 'bruise' : info.blast ? 'burn' : info.vehicle ? 'scrape' : info.melee ? (info.blade ? 'cut' : 'bruise') : info.stopped ? 'bruise' : 'bullet'); // (a vest stops it: a bruise under the plate)

  // ---- people
  const prevDamage = peds.damage.bind(peds);
  peds.damage = (p, amount, from, info) => {
    const was = p.mode;
    let kind = null, point = null, dir = null;
    if (on() && was !== 'dead' && p.h) {
      try {
        kind = kindOf(info);
        point = info?.point || p.pos.clone().add(new THREE.Vector3(0, kind === 'scrape' ? 0.9 : 1.25, 0)).addScaledVector(from ? from.clone().sub(p.pos).setY(0).normalize() : new THREE.Vector3(), 0.18);
        dir = info?.dir || (from ? point.clone().sub(from).normalize() : null);
        if (nearCam(p.pos) && !p.h.ragdoll) { addWound(p.h, point, kind); wounded.add(p.h); } // (before the hit: a killing hit starts the ragdoll)
      } catch (e) { console.error('[gore] ' + (e && e.message), e); kind = null; }
    }
    const killed = prevDamage(p, amount, from, info);
    if (!kind) return killed;
    try {
      if (kind === 'bullet' || kind === 'cut') { blood.spatter(point, dir, kind === 'cut' ? 0.6 : 1); p.bleed = Math.max(p.bleed || 0, kind === 'bullet' ? 45 : 20); }
      if (kind === 'scrape' && amount > 20) blood.smear(p.pos, info?.vehicle ? new THREE.Vector3(Math.sin(info.vehicle.heading), 0, Math.cos(info.vehicle.heading)) : null);
      if (killed || p.mode === 'dead' || p.hp < 25) p.poolT = p.poolT ?? (killed ? 1.6 : 4); // once they've fallen and stopped moving
    } catch (e) { console.error('[gore] ' + (e && e.message), e); }
    return killed;
  };

  // ---- the player
  const bones = [];
  player.h.model.traverse((o) => { if (o.isBone && PLAYER_BONES.test(o.name)) bones.push(o); });
  const _b = new THREE.Vector3();
  // a point on the player's body facing where the hurt came from (no exact hit point for the player)
  const playerPoint = (from) => {
    if (!bones.length) return player.pos.clone().add(new THREE.Vector3(0, 1.2, 0));
    const b = bones[(Math.random() * bones.length) | 0];
    b.getWorldPosition(_b);
    const toward = from ? new THREE.Vector3(from.x - _b.x, 0, from.z - _b.z) : new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5);
    if (toward.lengthSq() < 1e-6) toward.set(1, 0, 0);
    return _b.clone().addScaledVector(toward.normalize(), 0.11);
  };
  game.onPlayerHurt = (amount, from, pen, kind) => {
    if (!on() || S.mode !== 'foot' || amount < 2) return;
    const k = kind || (pen >= 1 && from ? 'bullet' : pen > 0 ? 'cut' : 'bruise'); // (fists come in at 0, a knife at 0.5, bullets 1+)
    const pt = playerPoint(from);
    addWound(player.h, pt, k); wounded.add(player.h);
    if (k === 'bullet') { blood.spatter(pt, from ? pt.clone().sub(new THREE.Vector3(from.x, pt.y, from.z)).normalize() : null, 0.8); S.bleed = Math.max(S.bleed || 0, 30); }
  };

  let lastHours = sky.day * 24 + sky.hour, dripT = 0;
  const lastDrip = new Map();
  return {
    blood,
    update(dt) {
      if (!on()) { blood.setVisible(false); return; }
      blood.setVisible(true);
      blood.update(dt, game.weather?.kind === 'rain' || game.weather?.kind === 'storm' ? 1 : 0);
      // pools under the fallen; drips from the bleeding (people and you)
      if ((dripT -= dt) <= 0) {
        dripT = 0.25;
        for (const p of peds.list) {
          if (p.poolT != null && p.poolT !== -1) {
            p.poolT -= 0.25;
            if (p.poolT <= 0) { p.poolT = -1; const at = p.h.ragdoll ? p.h.root.position : p.pos; if (nearCam(at, 120)) blood.pool(at, p.mode === 'dead' ? 1.2 : 0.7, p.mode === 'dead' ? 30 : 60); }
          }
          if (p.bleed > 0 && p.mode !== 'dead') {
            p.bleed -= 0.25;
            const l = lastDrip.get(p);
            if (!l || l.distanceTo(p.pos) > 0.9) { if (l || Math.random() < 0.3) blood.drop(p.pos, 0.18); lastDrip.set(p, p.pos.clone()); }
          } else if (lastDrip.has(p)) lastDrip.delete(p);
        }
        if (S.bleed > 0 && S.mode === 'foot') {
          S.bleed -= 0.25;
          const l = lastDrip.get(player);
          if (!l || l.distanceTo(player.pos) > 1.1) { blood.drop(player.pos, 0.16); lastDrip.set(player, player.pos.clone()); }
        }
      }
      // wounds: blood keeps running from fresh holes; yours heal over game days
      const hours = sky.day * 24 + sky.hour, gh = Math.max(0, Math.min(6, hours - lastHours)); lastHours = hours;
      for (const h of wounded) {
        if (h === player.h) tickWounds(h, dt, { healDays: HEAL_DAYS, gameHours: gh });
        else tickWounds(h, dt);
        if (!h.wound || !h.wound.list.length || (h !== player.h && !h.root.parent)) wounded.delete(h);
      }
      for (const [k] of lastDrip) if (k !== player && !peds.list.includes(k)) lastDrip.delete(k);
    },
  };
}
