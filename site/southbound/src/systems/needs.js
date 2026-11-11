// Looking after John: sleep, food and body weight.
//  - Energy drains over the day. Tired: no sprinting for long, shakier aim.
//    Exhausted: you stumble and your eyes droop. Sleep at a home you own or
//    the bunkhouse at the hideout.
//  - Food drains too. Hungry: no healing. Starving: you lose health.
//  - Eat more than you burn and you put on weight; skip meals and you lose
//    it. Underweight: less health and weaker punches. Overweight: you tire
//    faster when you run. It shows on John.
import * as THREE from 'three';
import { keyHint } from './world-util.js';

export function installNeeds(game) {
  const { career, hud, player, sky, S, interact } = game;
  const P = career.p;
  P.needs = P.needs || { energy: 90, food: 70, weight: 78 };
  const N = P.needs;
  let lastClock = sky.day * 24 + sky.hour;

  // ---------------- meters under the health bar
  const box = document.createElement('div');
  box.id = 'sbneeds';
  box.style.cssText = 'position:fixed;left:236px;bottom:16px;flex-direction:column;z-index:12;display:flex;gap:10px;font:600 10.5px Inter,system-ui,sans-serif;color:#f2ead8;pointer-events:none;text-shadow:0 1px 2px #000';
  box.innerHTML = '<span>☕ <b data-k="energy"></b></span><span>🍽 <b data-k="food"></b></span><span>⚖ <b data-k="weight"></b></span>';
  document.body.appendChild(box);
  const show = () => {
    const word = (v, a) => (v > 60 ? a[0] : v > 25 ? a[1] : v > 8 ? a[2] : a[3]);
    box.querySelector('[data-k=energy]').textContent = word(N.energy, ['Rested', 'OK', 'Tired', 'Exhausted']);
    box.querySelector('[data-k=food]').textContent = word(N.food, ['Fed', 'Peckish', 'Hungry', 'Starving']);
    box.querySelector('[data-k=weight]').textContent = `${N.weight.toFixed(1)} kg${N.weight < 68 ? ' (under)' : N.weight > 92 ? ' (over)' : ''}`;
    box.querySelector('[data-k=energy]').style.color = N.energy > 25 ? '' : '#ff9a6a';
    box.querySelector('[data-k=food]').style.color = N.food > 25 ? '' : '#ff9a6a';
  };

  // ---------------- eating and sleeping
  game.feed = (amount) => {
    const before = N.food;
    N.food = Math.min(110, N.food + amount);
    if (before + amount > 100) N.weight += (before + amount - 100) * 0.012; // eating past full
    show();
  };
  game.sleep = (hours = 8, where = '', now = false) => {
    if (!now && game.acts && S.mode === 'foot' && !S.doorWalk && S.dead <= 0) {
      // (the night itself is slept by the function below, not game.sleep again: crew.js wraps game.sleep)
      const run = game.acts.play(game.acts.sleepBeats(), { done: () => { slept(hours, where); setTimeout(() => game.acts.fade(false), 400); } });
      if (run) return;
    }
    slept(hours, where);
  };
  const slept = (hours, where) => {
    N.energy = Math.min(100, N.energy + hours * 13);
    N.food = Math.max(0, N.food - hours * 2.5);
    sky.hour += hours; if (sky.hour >= 24) { sky.hour -= 24; sky.day += 1; }
    lastClock = sky.day * 24 + sky.hour;
    player.health = Math.min(player.maxHealth || 100, player.health + 40);
    hud.bigMessage?.('SLEPT', `${hours} hours${where ? ' · ' + where : ''}`, 2.5);
    career.saveSoon(); show();
  };
  if (game.hideout) {
    const H = game.hideout;
    interact.add({ x: H.x + 6, z: H.z - 4, r: 1.8, color: 0x9fc4c0, label: () => `${keyHint(game)} sleep in the bunkhouse (8 h)`, show: () => S.mode === 'foot' && N.energy < 85,
      use: () => game.sleep(8, 'the Gulf Line bunkhouse') });
  }

  // ---------------- body
  const applyBody = () => {
    const k = (N.weight - 78) / 78;
    player.h.model.scale.set(1 + k * 0.55, 1, 1 + k * 0.7);
    player.maxHealth = N.weight < 68 ? 85 : 100;
  };
  applyBody();
  let warnT = 0, blinkT = 0, bodyT = 0;
  const veil = document.createElement('div');
  veil.style.cssText = 'position:fixed;inset:0;z-index:11;pointer-events:none;background:#000;opacity:0;transition:opacity .4s';
  document.body.appendChild(veil);
  show();

  return {
    N,
    update(dt, a) {
      // drain with the game clock (works through time skips, sleeping, jail)
      const clock = sky.day * 24 + sky.hour;
      let gh = clock - lastClock; lastClock = clock;
      if (gh < 0 || gh > 48) gh = 0;
      if (gh > 0 && S.dead <= 0) {
        const busy = player.speed > 5 ? 1.6 : 1;
        N.energy = Math.max(0, N.energy - gh * 4.2 * busy);
        N.food = Math.max(0, N.food - gh * 5.5 * busy);
        if (N.food < 20) N.weight = Math.max(52, N.weight - gh * 0.04);
        if (N.food > 90) N.weight = Math.min(130, N.weight + gh * 0.012);
      }
      // effects
      const tired = N.energy < 25, wrecked = N.energy < 8, hungry = N.food < 25, starving = N.food < 8;
      S.noRegen = hungry || (game.foodPlus?.sick || 0) > 0; // or sick from bad food (systems/foodplus.js)
      if (starving && player.health > 5) player.health -= dt * 0.25;
      if (player.health > (player.maxHealth || 100)) player.health = player.maxHealth || 100;
      // sprinting: tired or overweight people run out of breath
      S.stamina = S.stamina ?? 1;
      const heavy = N.weight > 92;
      if (a && a.sprint && player.speed > 5) S.stamina = Math.max(0, S.stamina - dt * (0.12 + (tired ? 0.25 : 0) + (heavy ? 0.12 : 0)));
      else S.stamina = Math.min(1, S.stamina + dt * (tired ? 0.06 : 0.15));
      if (a && S.stamina <= 0.02) a.sprint = false;
      S.tiredSpread = tired ? 1.35 : 1;
      // eyelids
      if (wrecked && (blinkT -= dt) <= 0) { blinkT = 6 + Math.random() * 6; veil.style.opacity = '0.85'; setTimeout(() => { veil.style.opacity = '0'; }, 650); }
      if ((warnT -= dt) <= 0) {
        warnT = 75;
        if (wrecked) hud.toast('John can barely keep his eyes open. Get some sleep.', 3);
        else if (tired) hud.toast('John is tired. Sleep at home or at the hideout.', 2.5);
        if (starving) hud.toast('John is starving. Eat something.', 3);
        else if (hungry) hud.toast('*stomach growls* John is hungry.', 2);
      }
      if ((bodyT -= dt) <= 0) { bodyT = 5; applyBody(); show(); }
    },
  };
}
void THREE;
