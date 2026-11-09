// What the player is doing right now, in one place (R1), so everyone who walks up to you, robs you,
// talks to you or decides how to react agrees on it.
//
// The owner was robbed while speeding away in a car: the mugger had walked to where they'd got in
// (the on-foot body stays there while you drive), "reached" them and took the wallet six seconds
// later. Systems ask `game.situation()` instead of guessing from S.mode or player.pos:
//   pos         where you are (your vehicle when you're in one)
//   onFoot, inVehicle, vehicle, boat, air
//   speed       m/s (the vehicle's, or how fast you're moving on foot)
//   indoors, scene (a cutscene or an arrest), down (dying / respawning)
//   armed (a weapon out), aiming, wanted (stars), mission (a mission running)
//   reachable   someone on foot can walk up to you: on foot and not running, or sat in a stopped car
//   muggable    a mugger would pick you: outdoors, on foot, unarmed, not wanted, standing or walking
//   fast        moving at speed (running hard or driving)
import * as THREE from 'three';

export function installSituation(game) {
  const { S, player, police, combat } = game;
  const last = new THREE.Vector3();
  let footSpeed = 0, seen = false;
  const sit = {};
  const read = () => {
    const v = S.mode === 'car' ? S.vehicle : null;
    const onFoot = S.mode === 'foot' && !S.entering;
    const speed = v ? Math.abs(v.speed || 0) : footSpeed;
    const scene = !!S.cutscene || !!game.law?.cutscene;
    const down = S.dead > 0 && !S.cutscene;
    const indoors = !!S.indoors;
    const armed = !!combat.drawn;
    const wanted = police.wanted | 0;
    const stoppedCar = !!v && !v.isBoat && !v.isAir && speed < 0.6;
    Object.assign(sit, {
      pos: v ? v.pos : player.pos, onFoot, inVehicle: !!v, vehicle: v, boat: !!v?.isBoat, air: !!v?.isAir,
      speed, indoors, scene, down, armed, aiming: armed && S.aimHold > 0, wanted, mission: !!game.missionActive?.(),
      reachable: !indoors && !scene && !down && ((onFoot && speed < 4.5) || stoppedCar),
      muggable: onFoot && !indoors && !scene && !down && !armed && wanted === 0 && speed < 3.2,
      fast: speed > 6,
    });
    return sit;
  };
  game.situation = read;
  return {
    // how fast you're moving on foot (the body's own speed isn't kept anywhere)
    update(dt) {
      if (!seen) { last.copy(player.pos); seen = true; }
      if (dt > 0) {
        const d = Math.min(15, Math.hypot(player.pos.x - last.x, player.pos.z - last.z) / dt);
        footSpeed += (d - footSpeed) * Math.min(1, dt * 6);
      }
      last.copy(player.pos);
    },
    read,
  };
}
