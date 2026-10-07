// The operator: movement, look, shooting, reloading, armor plates, health and down state.
import * as THREE from 'three';
import { WEAPONS, AMMO, BACKPACKS, MAX_PLATES } from './data.js';
import { clamp, rand, lerp } from './rng.js';
import { Viewmodel } from './viewmodel.js';

export class Gun {
  constructor(id, uid = null, mag) {
    this.id = id;
    this.uid = uid;
    this.def = WEAPONS[id];
    this.mag = mag ?? this.def.mag;
  }
}

const BASE_FOV = 74;
const _o = new THREE.Vector3(), _d = new THREE.Vector3(), _u = new THREE.Vector3(), _r = new THREE.Vector3(), _m = new THREE.Vector3();

export class Player {
  constructor(raid, kit, spawn) {
    this.raid = raid;
    this.pos = new THREE.Vector3(spawn.x, 0, spawn.z);
    this.vel = new THREE.Vector3();
    this.r = 0.38;
    this.h = 1.8;
    this.onGround = false;
    this.yaw = spawn.yaw;
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
    this.armor = kit.platesEquipped * 50;
    this.plates = kit.platesSpare;
    this.revives = kit.revives;
    this.weapons = [
      kit.primary ? new Gun(kit.primary.id, kit.primary.uid) : null,
      new Gun(kit.secondary.id, kit.secondary.uid),
    ];
    this.cur = this.weapons[0] ? 0 : 1;
    this.ammo = { pistol: 0, rifle: 0, sniper: 0, shell: 0 };
    for (const g of this.weapons) if (g) this.ammo[g.def.ammo] = AMMO[g.def.ammo].start;
    this.bagCap = BACKPACKS[kit.backpackTier].slots;
    this.bag = [];
    this.cash = 0;
    this.fireCD = 0;
    this.reloadT = 0;
    this.switchT = 0;
    this.plateT = 0;
    this.bloom = 0;
    this.lastHit = -99;
    this.lastShot = -99;
    this.semiLock = false;
    this.alive = true;
    this.downed = false;
    this.reviveT = 0;
    this.bob = 0;
    this.stepAcc = 0;
    this.shake = 0;
    this.killer = '';
    this.vm = new Viewmodel(raid.camera);
    this.vm.setWeapon(this.gun.def);
  }

  get gun() { return this.weapons[this.cur]; }
  get eyePos() { return _o.set(this.pos.x, this.pos.y + this.eye, this.pos.z); }

  update(dt, inp, uiOpen) {
    const raid = this.raid, cam = raid.camera;
    if (!this.alive) return;
    const k = uiOpen ? {} : inp.keys;
    const pressed = uiOpen ? new Set() : inp.pressed;

    // ----- down state (self-revive)
    if (this.downed) {
      this.reviveT -= dt;
      this.vel.x = this.vel.z = 0;
      if (this.reviveT <= 0) {
        this.downed = false;
        this.hp = 45;
        raid.hud.toast('Self-revive complete', '#5fd068');
      }
    }

    // ----- look
    if (!uiOpen) {
      const fovK = cam.fov / BASE_FOV;
      const sens = 0.0022 * raid.settings.sens * (0.35 + 0.65 * fovK);
      this.yaw -= inp.mdx * sens;
      this.pitch = clamp(this.pitch - inp.mdy * sens, -1.5, 1.5);
    }

    // ----- stance
    if (pressed.has('KeyC')) this.crouchToggle = !this.crouchToggle;
    const wantCrouch = this.crouchToggle || !!k.ControlLeft || this.downed;
    if (wantCrouch) this.crouch = true;
    else if (this.crouch && !raid.world.overlaps(this.pos.x, this.pos.y + 0.05, this.pos.z, this.r, 1.8)) this.crouch = false;
    this.h = this.crouch ? 1.2 : 1.8;

    // ----- movement
    const f = (k.KeyW ? 1 : 0) - (k.KeyS ? 1 : 0);
    const s = (k.KeyD ? 1 : 0) - (k.KeyA ? 1 : 0);
    const sy = Math.sin(this.yaw), cy = Math.cos(this.yaw);
    let wx = -sy * f + cy * s, wz = -cy * f - sy * s;
    const wl = Math.hypot(wx, wz);
    if (wl > 0) { wx /= wl; wz /= wl; }
    this.moving = wl > 0 && !this.downed;
    const wantSprint = !!k.ShiftLeft && f > 0 && !this.downed && this.plateT <= 0 && !inp.rmb;
    if (wantSprint && this.crouchToggle) this.crouchToggle = false;
    this.sprinting = wantSprint && !this.crouch;
    let speed = this.downed ? 0.9 : this.sprinting ? 6.8 : this.crouch ? 2.3 : 4.4;
    speed *= 1 - 0.42 * this.adsT;
    if (this.plateT > 0) speed *= 0.6;
    const accel = this.onGround ? 14 : 2.5;
    const kk = Math.min(1, accel * dt);
    this.vel.x += (wx * speed - this.vel.x) * kk;
    this.vel.z += (wz * speed - this.vel.z) * kk;
    if (pressed.has('Space') && this.onGround && !this.downed) {
      if (this.crouch) this.crouchToggle = false;
      else this.vel.y = 6.2;
    }
    this.vel.y -= 19 * dt;
    raid.world.moveBody(this, dt);

    const hs = Math.hypot(this.vel.x, this.vel.z);
    if (this.onGround && hs > 0.5) {
      this.bob += dt * hs * 1.7;
      this.stepAcc += hs * dt;
      if (this.stepAcc > (this.sprinting ? 2.2 : 1.7)) { this.stepAcc = 0; raid.audio.step(this.crouch ? 0.03 : 0.07); }
    }
    this.eye = lerp(this.eye, this.downed ? 0.6 : this.crouch ? 1.05 : 1.62, Math.min(1, dt * 12));

    // ----- weapon handling
    const gun = this.gun;
    const def = gun.def;
    this.fireCD -= dt;
    this.bloom = Math.max(0, this.bloom - dt * def.spread * 6);
    if (this.switchT > 0) this.switchT -= dt;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = def.mag - gun.mag;
        const take = Math.min(need, this.ammo[def.ammo]);
        gun.mag += take;
        this.ammo[def.ammo] -= take;
      }
    }
    if (this.plateT > 0) {
      this.plateT -= dt;
      if (this.plateT <= 0) {
        this.armor = Math.min(MAX_PLATES * 50, (Math.floor(this.armor / 50) + 1) * 50);
        this.plates--;
        raid.audio.plate();
        // chain plating while F is held
        if (k.KeyF) this.tryPlate();
      }
    }

    if (!this.downed) {
      if (pressed.has('Digit1') && this.weapons[0] && this.cur !== 0) this.switchTo(0);
      if (pressed.has('Digit2') && this.cur !== 1) this.switchTo(1);
      if ((pressed.has('KeyQ') || inp.wheel) && this.weapons[0]) this.switchTo(1 - this.cur);
      if (pressed.has('KeyR')) this.tryReload();
      if (pressed.has('KeyF')) this.tryPlate();
    }

    const canAds = inp.rmb && !uiOpen && !this.sprinting && this.switchT <= 0 && this.plateT <= 0 && !this.downed;
    const adsSpeed = def.scope ? 3.6 : 5.5;
    this.adsT = clamp(this.adsT + (canAds ? dt : -dt) * adsSpeed, 0, 1);

    if (!inp.lmb) this.semiLock = false;
    if (inp.lmb && !uiOpen && !this.downed) {
      if (this.sprinting) this.sprinting = false;
      const ready = this.fireCD <= 0 && this.reloadT <= 0 && this.switchT <= 0 && this.plateT <= 0;
      if (ready && !(this.semiLock && !def.auto)) {
        if (gun.mag > 0) this.shoot();
        else if (!this.semiLock) {
          raid.audio.dry();
          this.semiLock = true;
          this.tryReload();
        }
      }
    }

    // ----- health regen
    if (!this.downed && raid.time - this.lastHit > 5 && this.hp < 100) this.hp = Math.min(100, this.hp + 22 * dt);

    // ----- camera
    this.recoilP = lerp(this.recoilP, 0, Math.min(1, dt * 5));
    this.recoilY = lerp(this.recoilY, 0, Math.min(1, dt * 5));
    this.shake = Math.max(0, this.shake - dt * 2);
    const sh = this.shake * 0.02;
    const bobY = this.moving && this.onGround ? Math.sin(this.bob * 2) * 0.035 * (1 - this.adsT) : 0;
    cam.position.set(this.pos.x, this.pos.y + this.eye + bobY, this.pos.z);
    cam.rotation.set(this.pitch + this.recoilP + rand(-sh, sh), this.yaw + this.recoilY + rand(-sh, sh), 0, 'YXZ');
    const targetFov = lerp(BASE_FOV, def.fov, this.adsT) + (this.sprinting ? 4 : 0);
    if (Math.abs(cam.fov - targetFov) > 0.01) { cam.fov = lerp(cam.fov, targetFov, Math.min(1, dt * 14)); cam.updateProjectionMatrix(); }

    this.vm.update(dt, {
      adsT: this.adsT, moving: this.moving && this.onGround, bob: this.bob, mdx: inp.mdx, mdy: inp.mdy,
      sprint: this.sprinting ? 1 : 0,
      reload: this.reloadT > 0 ? 1 - this.reloadT / def.reload : 0,
      plate: this.plateT > 0 ? 1 - this.plateT / 1.1 : 0,
    });
  }

  switchTo(i) {
    if (!this.weapons[i] || this.downed) return;
    this.cur = i;
    this.reloadT = 0;
    this.plateT = 0;
    this.switchT = 0.45;
    this.adsT = 0;
    this.vm.setWeapon(this.gun.def);
    this.raid.audio.swap();
  }

  tryReload() {
    const g = this.gun;
    if (this.reloadT > 0 || this.plateT > 0 || g.mag >= g.def.mag) return;
    if (this.ammo[g.def.ammo] <= 0) { this.raid.hud.toast(`No ${AMMO[g.def.ammo].name} ammo`, '#ff6a5a'); return; }
    this.reloadT = g.def.reload;
    this.raid.audio.reload(g.def.reload);
  }

  tryPlate() {
    if (this.plateT > 0 || this.downed) return;
    if (this.armor >= MAX_PLATES * 50) return;
    if (this.plates <= 0) { this.raid.hud.toast('No armor plates', '#ff6a5a'); return; }
    this.reloadT = 0;
    this.plateT = 1.1;
    this.adsT = 0;
  }

  shoot() {
    const raid = this.raid, g = this.gun, def = g.def;
    g.mag--;
    this.fireCD = 60 / def.rpm;
    this.lastShot = raid.time;
    if (!def.auto) this.semiLock = true;
    const cam = raid.camera;
    cam.updateMatrixWorld();
    cam.getWorldPosition(_o);
    cam.getWorldDirection(_d);
    _r.set(1, 0, 0).applyQuaternion(cam.quaternion);
    _u.set(0, 1, 0).applyQuaternion(cam.quaternion);
    let spread = lerp(def.spread, def.adsSpread, this.adsT);
    if (this.moving) spread *= 1.5;
    if (this.crouch) spread *= 0.75;
    if (!this.onGround) spread *= 2.5;
    spread += this.bloom * (1 - this.adsT * 0.7);
    this.vm.muzzleWorld(_m);
    const pellets = def.pellets || 1;
    for (let i = 0; i < pellets; i++) {
      const a = Math.random() * Math.PI * 2, rr = Math.sqrt(Math.random()) * spread;
      const dir = _d.clone().addScaledVector(_r, Math.cos(a) * rr).addScaledVector(_u, Math.sin(a) * rr).normalize();
      raid.playerShot(_o.clone(), dir, def, _m.clone(), i === 0);
    }
    const rk = def.recoil * (1 - 0.35 * this.adsT) * rand(0.85, 1.15);
    this.pitch += rk * 0.55;
    this.recoilP += rk * 0.45;
    this.recoilY += rand(-1, 1) * def.recoil * 0.35;
    this.bloom = Math.min(def.spread * 1.2, this.bloom + def.spread * 0.18);
    this.vm.kick();
    raid.audio.shot(def.ammo, 0, 0, true);
    raid.noise(this.pos, def.scope ? 140 : 110);
    if (g.mag === 0 && this.ammo[def.ammo] > 0) setTimeout(() => { if (this.gun === g && g.mag === 0) this.tryReload(); }, 250);
  }

  damage(amount, from, by, bypassArmor = false) {
    if (!this.alive || this.downed) return;
    const raid = this.raid;
    this.lastHit = raid.time;
    if (!bypassArmor && this.armor > 0) {
      const a = Math.min(this.armor, amount);
      const before = this.armor;
      this.armor -= a;
      amount -= a;
      if (Math.floor(before / 50) > Math.floor(this.armor / 50) || this.armor === 0) raid.audio.armorBreak();
    }
    this.hp -= amount;
    this.shake = Math.min(1, this.shake + 0.35);
    if (from) raid.hud.damageFrom(from);
    if (amount > 1) raid.audio.hurt();
    if (this.hp <= 0) {
      this.hp = 0;
      if (this.revives > 0) {
        this.revives--;
        this.downed = true;
        this.reviveT = 4;
        this.plateT = 0;
        this.reloadT = 0;
        raid.hud.toast('DOWNED — self-reviving…', '#ff6a5a');
      } else {
        this.alive = false;
        this.killer = by || 'Unknown';
        raid.endRaid(false, by ? `Killed by ${by}` : 'Killed in action');
      }
    }
  }
}
