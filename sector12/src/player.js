// The player: movement (terrain, swimming, ladders, slippery snow), weapons, melee/throwables,
// medical, bleeding, heat/cold exposure.
import * as THREE from 'three';
import { ITEMS, AMMO, ammoOptions, armorSpeed } from './data/catalog.js';
import { Viewmodel } from './viewmodel.js';
import { magSize, isGun } from './inventory.js';
import { applyHit, newStatus, statusDrain, randomZone } from './damage.js';
import { normalAt, regionAt } from './terrain.js';
import { clamp, rand, lerp } from './rng.js';

const BASE_FOV = 74;
const SLOTS = ['w0', 'w1', 'melee', 'throw', 'flare'];
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Vector3();

// Fire parameters for a gun instance (the Patriot 09 switches to its shotgun tube when pumped).
export function gunParams(inst) {
  const d = ITEMS[inst.id];
  if (d.tube && inst.alt) return { ...d, ...d.tube, alt: true };
  return d;
}

export class Player {
  constructor(game, inv, spawn) {
    this.game = game;
    this.inv = inv;
    this.pos = new THREE.Vector3(spawn.x, spawn.y, spawn.z);
    this.vel = new THREE.Vector3();
    this.r = 0.38;
    this.h = 1.8;
    this.onGround = true;
    this.yaw = spawn.yaw || 0;
    this.pitch = 0;
    this.recoilP = 0;
    this.recoilY = 0;
    this.eye = 1.62;
    this.crouchToggle = false;
    this.crouch = false;
    this.sprinting = false;
    this.moving = false;
    this.adsT = 0;
    this.hp = 100;
    this.status = newStatus();
    this.coldEx = 0;
    this.heatEx = 0;
    this.ambient = 20;
    this.alive = true;
    this.fireCD = 0;
    this.reloadT = 0;
    this.reloadTotal = 1;
    this.perRoundReload = false;
    this.busyT = 0;
    this.busyTotal = 1;
    this.busyAction = null;
    this.swingT = 0;
    this.pumpT = 0;
    this.switchT = 0;
    this.bloom = 0;
    this.semiLock = false;
    this.lastShot = -99;
    this.lastHit = -99;
    this.bob = 0;
    this.stepAcc = 0;
    this.shake = 0;
    this.airTime = 0;
    this.vm = new Viewmodel(game.camera);
    this.slot = SLOTS.find((s) => this.itemIn(s)) || 'hands';
    this.applySlot();
  }

  get vest() { return this.inv.vest; }
  get helmet() { return this.inv.helmet; }
  itemIn(s) {
    if (s === 'w0') return this.inv.weapons[0];
    if (s === 'w1') return this.inv.weapons[1];
    if (s === 'melee') return this.inv.melee;
    if (s === 'throw') return this.inv.throwing;
    if (s === 'flare') return this.inv.flare;
    return null;
  }
  get held() { return this.itemIn(this.slot); }
  get heldDef() { const h = this.held; return h ? ITEMS[h.id] : null; }

  applySlot() {
    const it = this.held;
    this.vm.set(it ? ITEMS[it.id] : null, it);
    this.reloadT = 0;
    this.switchT = 0.4;
    this.adsT = 0;
  }

  selectSlot(s) {
    if (s === this.slot && this.held) return;
    if (!this.itemIn(s)) return;
    this.slot = s;
    this.applySlot();
    this.game.audio.swap();
  }

  refreshHeld() { // after inventory changes (attachments, camo, swaps)
    if (!this.held) this.slot = SLOTS.find((s) => this.itemIn(s)) || 'hands';
    this.applySlot();
  }

  cycleSlot(dir) {
    const avail = SLOTS.filter((s) => this.itemIn(s));
    if (!avail.length) return;
    const i = avail.indexOf(this.slot);
    this.selectSlot(avail[(i + dir + avail.length) % avail.length]);
  }

  speedMul() {
    const st = this.status;
    const vl = this.inv.vest ? this.inv.vest.level : 0, hl = this.inv.helmet ? this.inv.helmet.level : 0;
    let k = armorSpeed(vl, hl);
    if (st.fracture && st.numb <= 0 && st.adrenaline <= 0) k *= 0.6;
    if (st.adrenaline > 0) k *= 1.25;
    if (this.coldEx >= 100 || this.heatEx >= 100) k *= 0.75;
    return k;
  }

  update(dt, inp, uiOpen) {
    const game = this.game, cam = game.camera;
    if (!this.alive) return;
    const k = uiOpen ? {} : inp.keys;
    const pressed = uiOpen ? new Set() : inp.pressed;
    const st = this.status;

    // ----- status + climate
    st.pain = Math.max(0, st.pain - dt);
    st.adrenaline = Math.max(0, st.adrenaline - dt);
    st.numb = Math.max(0, st.numb - dt);
    st.warm = Math.max(0, st.warm - dt);
    this.updateClimate(dt);
    const drain = statusDrain(st) + (this.coldEx >= 100 ? 1.5 : 0) + (this.heatEx >= 100 ? 1.2 : 0);
    if (drain > 0) {
      this.hp -= drain * dt;
      if (this.hp <= 0) {
        const cause = st.bleedLight + st.bleedHeavy > 0 ? 'Bled out' : this.coldEx >= 100 ? 'Froze to death' : this.heatEx >= 100 ? 'Died of heatstroke' : 'Died';
        return this.die(cause, null);
      }
    }

    // ----- look
    if (!uiOpen) {
      const sens = 0.0022 * game.settings.sens * (0.3 + 0.7 * (cam.fov / BASE_FOV));
      this.yaw -= inp.mdx * sens;
      this.pitch = clamp(this.pitch - inp.mdy * sens, -1.5, 1.5);
    }

    // ----- stance
    if (pressed.has('KeyC')) this.crouchToggle = !this.crouchToggle;
    if (this.crouchToggle || k.ControlLeft) this.crouch = true;
    else if (this.crouch && !game.physics.overlapsBox(this.pos.x, this.pos.y + 0.05, this.pos.z, this.r, 1.8)) this.crouch = false;
    this.h = this.crouch ? 1.2 : 1.8;

    // ----- movement
    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0), s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    this.moving = wl > 0;
    const busy = this.busyT > 0;
    this.sprinting = !!k.ShiftLeft && f > 0 && !inp.rmb && !this.crouch && !busy && !this.swimming;
    if (this.sprinting && this.crouchToggle) this.crouchToggle = false;
    let speed = this.swimming ? 2.3 : this.sprinting ? 6.6 : this.crouch ? 2.2 : 4.3;
    speed *= this.speedMul() * (1 - 0.42 * this.adsT) * (busy ? 0.55 : 1);
    const region = regionAt(this.pos.x, this.pos.z, this.pos.y);
    this.region = region;
    let accel = this.onGround || this.swimming ? 13 : 2.2;
    const n = normalAt(this.pos.x, this.pos.z, 1.2);
    this.slope = 1 - n[1];
    if (region === 'n' && this.onGround) {
      // Frostfang ice: less grip, and you slide on steep slopes
      accel *= this.slope > 0.06 ? 0.3 : 0.6;
      if (this.slope > 0.12) { this.vel.x += n[0] * 14 * dt; this.vel.z += n[2] * 14 * dt; }
    }
    const kk = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * kk;
    this.vel.z += (wz * speed - this.vel.z) * kk;

    const ladder = game.physics.ladderAt(this.pos.x, this.pos.y, this.pos.z, this.r + 0.15);
    if (this.swimming) {
      const target = this.waterLevel - 1.35;
      this.vel.y = (target - this.pos.y) * 3 + (k.Space ? 1.5 : 0);
    } else if (ladder && (k.KeyW || k.Space)) {
      this.vel.y = 3;
    } else {
      if (pressed.has('Space') && this.onGround) { if (this.crouch) this.crouchToggle = false; else this.vel.y = 6.0; }
      this.vel.y -= 19 * dt;
    }
    this.landSpeed = 0;
    game.physics.moveBody(this, dt);
    if (this.landSpeed > 12 && !ladder) {
      const fall = (this.landSpeed - 12) * 7;
      this.hurt(fall, 'Fall damage');
      if (fall > 15 && Math.random() < 0.6) this.status.fracture = true;
      if (!this.alive) return;
    }
    this.airTime = this.onGround || this.swimming ? 0 : this.airTime + dt;
    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.bob += dt * hs * 1.7;
      this.stepAcc += hs * dt;
      if (this.stepAcc > (this.sprinting ? 2.2 : 1.7)) { this.stepAcc = 0; game.audio.step(this.crouch ? 0.03 : 0.07); }
    }
    this.eye = lerp(this.eye, this.crouch ? 1.05 : 1.62, Math.min(1, dt * 12));

    // ----- actions
    this.fireCD -= dt;
    this.switchT -= dt;
    this.pumpT = Math.max(0, this.pumpT - dt);
    if (this.swingT > 0) {
      const prev = this.swingT;
      this.swingT -= dt;
      if (prev > 0.22 && this.swingT <= 0.22) this.meleeStrike();
    }
    if (this.busyT > 0) {
      this.busyT -= dt;
      if (this.busyT <= 0 && this.busyAction) { const a = this.busyAction; this.busyAction = null; a(); }
    }
    if (pressed.has('Digit1')) this.selectSlot('w0');
    if (pressed.has('Digit2')) this.selectSlot('w1');
    if (pressed.has('Digit3')) this.selectSlot('melee');
    if (pressed.has('Digit4')) this.selectSlot('throw');
    if (pressed.has('Digit5')) this.selectSlot('flare');
    if (pressed.has('KeyQ')) this.cycleSlot(1);
    if (inp.wheel) this.cycleSlot(inp.wheel > 0 ? 1 : -1);
    if (pressed.has('KeyF')) this.quickHeal();
    if (pressed.has('KeyH')) this.useMed('handwarmer');

    const it = this.held, d = it ? ITEMS[it.id] : null;
    let scoped = false;
    if (d && isGun(d)) scoped = this.updateGun(dt, inp, uiOpen, pressed, it, d);
    else if (d) this.updateTool(inp, uiOpen, it, d);
    else this.adsT = Math.max(0, this.adsT - dt * 6);

    // ----- camera
    this.recoilP = lerp(this.recoilP, 0, Math.min(1, dt * 5));
    this.recoilY = lerp(this.recoilY, 0, Math.min(1, dt * 5));
    this.shake = Math.max(0, this.shake - dt * 2);
    const sh = this.shake * 0.02 + (st.pain > 0 && st.numb <= 0 ? 0.002 : 0);
    const bobY = this.moving && this.onGround ? Math.sin(this.bob * 2) * 0.035 * (1 - this.adsT) : 0;
    cam.position.set(this.pos.x, this.pos.y + this.eye + bobY, this.pos.z);
    cam.rotation.set(this.pitch + this.recoilP + rand(-sh, sh), this.yaw + this.recoilY + rand(-sh, sh), 0, 'YXZ');
    let targetFov = BASE_FOV + (this.sprinting ? 4 : 0);
    if (d && isGun(d)) {
      const optic = (it.att && it.att.optic) || d.builtinOptic;
      const z = optic ? ITEMS[optic].zoom : 1;
      const P = gunParams(it);
      const adsFov = optic && ITEMS[optic].scoped ? BASE_FOV / z : Math.min(P.fov || 60, BASE_FOV / z);
      targetFov = lerp(targetFov, adsFov, this.adsT);
    }
    if (Math.abs(cam.fov - targetFov) > 0.01) { cam.fov = lerp(cam.fov, targetFov, Math.min(1, dt * 14)); cam.updateProjectionMatrix(); }
    this.scoped = scoped && this.adsT > 0.9;
    this.vm.update(dt, {
      adsT: this.adsT, moving: this.moving && this.onGround, bob: this.bob, mdx: inp.mdx, mdy: inp.mdy,
      sprint: this.sprinting ? 1 : 0,
      reload: this.reloadT > 0 ? 1 - this.reloadT / this.reloadTotal : 0,
      busy: this.busyT > 0 ? 1 - this.busyT / this.busyTotal : 0,
      swing: this.swingT > 0 ? 1 - this.swingT / 0.45 : 0,
      pump: this.pumpT > 0 ? 1 - this.pumpT / 0.45 : 0,
      scoped,
    });
  }

  // ---------------------------------------------------------------- climate
  updateClimate(dt) {
    const g = this.game, st = this.status, inv = this.inv;
    const amb = g.ambientTemp(this.pos);
    this.ambient = amb;
    const cloth = inv.clothing ? ITEMS[inv.clothing.id] : null, suit = inv.suit ? ITEMS[inv.suit.id] : null;
    const cold = (cloth?.cold || 0) + (suit?.cold || 0) + (st.warm > 0 ? 12 : 0) + (this.swimming ? -10 : 0);
    const heat = (cloth?.heat || 0) + (suit?.heat || 0) + (this.swimming ? 10 : 0);
    const coldStress = 8 - (amb + cold);
    const heatStress = amb - heat - 35;
    this.coldEx = clamp(this.coldEx + (coldStress > 0 ? coldStress * 0.12 : -6) * dt, 0, 100);
    this.heatEx = clamp(this.heatEx + (heatStress > 0 ? heatStress * 0.1 : -6) * dt, 0, 100);
    this.feels = coldStress > 0 ? 'cold' : heatStress > 0 ? 'hot' : 'ok';
  }

  // ---------------------------------------------------------------- guns
  updateGun(dt, inp, uiOpen, pressed, it, d) {
    const game = this.game;
    const P = gunParams(it);
    const opt = (it.att && it.att.optic) || d.builtinOptic;
    const scoped = !!(opt && ITEMS[opt].scoped);
    this.bloom = Math.max(0, this.bloom - dt * P.spread * 6);

    // reload progress
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) this.finishReload(it);
    }
    if (pressed.has('KeyR')) this.startReload(it);
    if (pressed.has('KeyT')) this.cycleAmmo(it);
    if (pressed.has('KeyV') && d.tube) {
      it.alt = !it.alt;
      this.pumpT = 0.45;
      this.reloadT = 0;
      game.audio.pump();
      game.hud.toast(it.alt ? 'Patriot 09: shotgun tube (12 gauge)' : 'Patriot 09: rifle (5.56)', '#ffd23f');
    }
    const canAds = inp.rmb && !uiOpen && !this.sprinting && this.switchT <= 0 && this.busyT <= 0;
    this.adsT = clamp(this.adsT + (canAds ? dt : -dt) * (scoped ? 3.6 : 5.5), 0, 1);

    if (!inp.lmb) this.semiLock = false;
    const auto = P.mode === 'auto';
    if (inp.lmb && !uiOpen && this.busyT <= 0 && !this.swimming) {
      if (this.sprinting) this.sprinting = false;
      if (this.reloadT > 0 && this.perRoundReload && this.loaded(it) > 0) this.reloadT = 0; // interrupt shell-by-shell reloads
      const ready = this.fireCD <= 0 && this.reloadT <= 0 && this.switchT <= 0 && this.pumpT <= 0.05;
      if (ready && !(this.semiLock && !auto)) {
        if (this.loaded(it) > 0) this.shoot(it, d, P);
        else if (!this.semiLock) {
          game.audio.dry();
          this.semiLock = true;
          if (d.noReload) game.hud.toast('The Victors are empty — they can\'t be reloaded', '#ff6a5a');
          else this.startReload(it);
        }
      }
    }
    return scoped;
  }

  loaded(it) { return it.alt ? it.tube : it.mag; }
  capacity(it) { const d = ITEMS[it.id]; return it.alt ? d.tube.mag : magSize(it); }
  ammoType(it) { return it.alt ? it.tubeAmmo : it.ammo; }

  startReload(it) {
    const d = ITEMS[it.id], P = gunParams(it);
    if (d.noReload || this.reloadT > 0 || this.busyT > 0) return;
    if (this.loaded(it) >= this.capacity(it)) return;
    const type = this.ammoType(it);
    if (this.inv.ammo[type] <= 0) { this.game.hud.toast(`No ${AMMO[type].name}`, '#ff6a5a'); return; }
    this.perRoundReload = !!(P.perRound || it.alt);
    const drum = it.att && it.att.mag === 'drum' ? 1.35 : 1;
    this.reloadTotal = this.reloadT = P.reload * (this.perRoundReload ? 1 : drum);
    this.game.audio.reload(this.reloadTotal);
  }

  finishReload(it) {
    const type = this.ammoType(it);
    const cap = this.capacity(it);
    if (this.perRoundReload) {
      if (this.inv.ammo[type] > 0 && this.loaded(it) < cap) {
        this.inv.ammo[type]--;
        if (it.alt) it.tube++; else it.mag++;
      }
      if (this.loaded(it) < cap && this.inv.ammo[type] > 0) { this.reloadT = this.reloadTotal; this.game.audio.shell(); }
      else this.perRoundReload = false;
      return;
    }
    const take = Math.min(cap - it.mag, this.inv.ammo[type]);
    it.mag += take;
    this.inv.ammo[type] -= take;
  }

  cycleAmmo(it) {
    const d = ITEMS[it.id], P = gunParams(it);
    if (d.noReload) return;
    const opts = ammoOptions(P);
    const cur = this.ammoType(it);
    const avail = opts.filter((o) => o === cur || this.inv.ammo[o] > 0);
    if (avail.length < 2) { this.game.hud.toast('No other compatible ammo', '#ff6a5a'); return; }
    const next = avail[(avail.indexOf(cur) + 1) % avail.length];
    // unload the current rounds back into the pouch
    this.inv.ammo[cur] += this.loaded(it);
    if (it.alt) { it.tube = 0; it.tubeAmmo = next; } else { it.mag = 0; it.ammo = next; }
    this.reloadT = 0;
    this.game.hud.toast(`Loading ${AMMO[next].name}`, AMMO[next].color);
    this.startReload(it);
  }

  shoot(it, d, P) {
    const game = this.game, cam = game.camera;
    const type = this.ammoType(it), A = AMMO[type];
    if (it.alt) it.tube--; else it.mag--;
    this.fireCD = 60 / P.rpm;
    this.lastShot = game.time;
    if (P.mode !== 'auto') this.semiLock = true;
    if (P.mode === 'pump' || P.mode === 'bolt') this.pumpT = 0.45;
    cam.updateMatrixWorld();
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    let spread = lerp(P.spread, P.adsSpread, this.adsT);
    if (this.moving) spread *= 1.5;
    if (this.crouch) spread *= 0.75;
    if (!this.onGround) spread *= 2.5;
    spread += this.bloom * (1 - this.adsT * 0.7);
    this.vm.muzzleWorld(_m);
    const pellets = A.shot ? (P.pellets || 8) : 1;
    const slugInShotgun = !A.shot && (P.pellets || 0) > 1;
    const dmg = slugInShotgun ? P.dmg * P.pellets * 0.6 : P.dmg;
    const range = slugInShotgun ? 50 : P.range;
    for (let i = 0; i < pellets; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * (A.shot ? Math.max(spread, P.spread * 0.8) : spread);
      const dir = _d.clone().addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
      game.fireBullet({
        origin: _o.clone(), dir, muzzle: _m.clone(), dmg, pen: A.pen + (d.penBonus || 0), ammo: type, range,
        explosive: A.explosive, blast: A.blast, blastDmg: A.blastDmg, shot: pellets > 1, shooter: this, tracer: i === 0,
      });
    }
    const rk = P.recoil * (1 - 0.35 * this.adsT) * rand(0.85, 1.15) * (d.dual ? 0.7 : 1);
    this.pitch += rk * 0.55;
    this.recoilP += rk * 0.45;
    this.recoilY += rand(-1, 1) * P.recoil * (d.dual ? 0.9 : 0.35);
    this.bloom = Math.min(P.spread * 1.2, this.bloom + P.spread * 0.18);
    this.vm.kick();
    game.audio.shot(type, 0, 0, true, d.id === 'bg850' || d.id === 'guillotine');
    game.noise(this.pos, d.id === 'bg850' ? 400 : 160, this);
  }

  // ---------------------------------------------------------------- melee / throwables / flare
  updateTool(inp, uiOpen, it, d) {
    this.adsT = 0;
    if (!inp.lmb) this.semiLock = false;
    if (uiOpen || this.busyT > 0 || this.swingT > 0 || this.switchT > 0) return;
    const game = this.game;
    if (d.melee && !d.throwable) {
      if (inp.lmb && !this.semiLock) { this.semiLock = true; this.swingT = d.id === 'hatchet' ? 0.6 : 0.45; game.audio.swing(); }
      if (inp.rmb && d.id === 'co2knife' && it.loaded && !this.rmbLock) {
        this.rmbLock = true;
        it.loaded = false;
        game.throwProjectile('co2blade', this, { dmg: d.shootDmg, straight: d.shootRange, speed: 70 });
        game.audio.co2();
      }
      if (!inp.rmb) this.rmbLock = false;
      return;
    }
    if (d.throwable && inp.lmb && !this.semiLock && it.count > 0) {
      this.semiLock = true;
      it.count--;
      this.swingT = 0.35;
      game.throwProjectile('knife', this, { dmg: d.dmg, speed: 32 });
      if (it.count <= 0) { this.inv.throwing = null; this.refreshHeld(); }
      return;
    }
    if (it.id === 'flaregun' && inp.lmb && !this.semiLock) {
      this.semiLock = true;
      if (it.shots <= 0) { game.audio.dry(); game.hud.toast('Flare gun is empty', '#ff6a5a'); return; }
      it.shots--;
      this.vm.kick();
      game.throwProjectile('flare', this, { speed: 45 });
      game.audio.shot('light', 0, 0, true);
    }
  }

  meleeStrike() {
    const d = this.heldDef;
    if (!d) return;
    this.game.meleeHit(this, d.dmg, d.id === 'hatchet' ? 2.6 : 2.2);
  }

  // ---------------------------------------------------------------- medical
  quickHeal() {
    const st = this.status, m = this.inv.meds;
    let pick = null;
    if (st.bleedHeavy > 0) pick = st.heavyLimb && m.tourniquet ? 'tourniquet' : m.medkit ? 'medkit' : m.gauze ? 'gauze' : m.tourniquet ? 'tourniquet' : null;
    else if (st.bleedLight > 0) pick = m.bandage ? 'bandage' : m.gauze ? 'gauze' : m.medkit ? 'medkit' : null;
    else if (st.fragments > 0 && m.scalpel) pick = 'scalpel';
    else if (st.fracture) pick = m.medkit ? 'medkit' : m.numbing ? 'numbing' : null;
    else if (this.hp < 85) pick = m.medkit && this.hp < 50 ? 'medkit' : m.meat ? 'meat' : m.medkit ? 'medkit' : null;
    if (!pick) { this.game.hud.toast(this.hp >= 85 && !st.bleedLight && !st.bleedHeavy ? 'Nothing to treat' : 'No suitable medical supplies', '#ff6a5a'); return; }
    this.useMed(pick);
  }

  useMed(id) {
    if (this.busyT > 0) return;
    if (!this.inv.meds[id]) { this.game.hud.toast(`No ${ITEMS[id].name}`, '#ff6a5a'); return; }
    const med = ITEMS[id].med;
    this.inv.meds[id]--;
    this.reloadT = 0;
    this.busyTotal = this.busyT = med.time;
    this.busyAction = () => this.applyMed(id);
    this.game.hud.toast(`Using ${ITEMS[id].name}…`, '#9fe8ff', med.time);
  }

  applyMed(id) {
    const m = ITEMS[id].med, st = this.status;
    if (m.stop === 'light' && st.bleedLight > 0) st.bleedLight--;
    if (m.reduce && st.bleedLight === 0 && st.bleedHeavy > 0) { st.bleedHeavy--; st.bleedLight++; }
    if (m.stop === 'heavy' && st.bleedHeavy > 0) { st.bleedHeavy--; if (!st.bleedHeavy) st.heavyLimb = false; }
    if (m.stop === 'all') { st.bleedLight = 0; st.bleedHeavy = 0; st.heavyLimb = false; }
    if (m.fix) st.fracture = false;
    if (m.heal) this.hp = Math.min(100, this.hp + m.heal);
    if (m.adrenaline) st.adrenaline = m.adrenaline;
    if (m.numb) st.numb = m.numb;
    if (m.fragment) st.fragments = Math.max(0, st.fragments - 2);
    if (m.warm) st.warm = m.warm;
    this.game.audio.pickup();
  }

  // ---------------------------------------------------------------- taking damage
  // hit: {dmg, pen, ammo, zone?, explosive, blast, shot}
  takeHit(hit, fromPos, byName) {
    if (!this.alive) return;
    hit.zone = hit.zone || randomZone();
    this.lastHit = this.game.time;
    const r = applyHit(this, hit);
    this.shake = Math.min(1, this.shake + 0.35);
    if (fromPos) this.game.hud.damageFrom(fromPos);
    if (r.armorHit) this.game.audio.armorHit(); else this.game.audio.hurt();
    if (this.armorBroke) { this.game.hud.toast(`${this.armorBroke === 'vest' ? 'Vest' : 'Helmet'} destroyed`, '#ff6a5a'); this.armorBroke = null; }
    if (this.hp <= 0) this.die(byName ? `Killed by ${byName}` : 'Killed', byName, hit.zone);
  }

  hurt(amount, cause) {
    this.hp -= amount;
    this.lastHit = this.game.time;
    this.game.audio.hurt();
    if (this.hp <= 0) this.die(cause, null);
  }

  die(cause, killer, zone) {
    if (!this.alive) return;
    this.alive = false;
    this.hp = 0;
    this.game.playerDied(cause, killer, zone);
  }
}
