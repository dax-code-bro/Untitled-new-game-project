// Ambient life, so the island never feels like an empty void:
//  * flocks of birds wheeling overhead by day (gulls on the coast, crows up north), wings flapping
//  * drifting pollen and dust motes in the sunlight, fireflies blinking at night in the green biomes,
//    ice glitter in the cold, sand wisps in the desert
//  * a soundscape: wind that follows the weather, birdsong by day, crickets and frogs at night
import * as THREE from 'three';
import { heightAt, regionAt } from './terrain.js';

const V = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const rnd = (a, b) => a + Math.random() * (b - a);

function wingGeometry(side) {
  // one wing: a swept triangle from the body out to the tip
  const g = new THREE.BufferGeometry();
  const s = side;
  g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, -0.12, s * 0.62, 0.02, 0.06, 0, 0, 0.16, 0, 0, 0.16, s * 0.62, 0.02, 0.06, s * 0.35, 0, 0.22], 3));
  g.computeVertexNormals();
  return g;
}

class Flock {
  constructor(center, n, kind) {
    this.center = center.clone();
    this.kind = kind;
    this.birds = Array.from({ length: n }, (_, i) => ({ a: (i / n) * Math.PI * 2 + rnd(0, 0.6), r: rnd(18, 40), h: rnd(-6, 6), sp: rnd(0.18, 0.3), ph: rnd(0, 7), glide: 0 }));
    this.drift = V(rnd(-1, 1), 0, rnd(-1, 1)).normalize().multiplyScalar(rnd(2, 5));
    this.alt = rnd(35, 80);
    this.life = rnd(60, 140);
  }
}

export class Ambient {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.flocks = [];
    this.max = 90;
    const mk = (color) => {
      const m = new THREE.MeshStandardMaterial({ color, roughness: 0.9, side: THREE.DoubleSide });
      const L = new THREE.InstancedMesh(wingGeometry(-1), m, this.max), R = new THREE.InstancedMesh(wingGeometry(1), m, this.max);
      const body = new THREE.InstancedMesh(new THREE.CapsuleGeometry(0.05, 0.22, 2, 6).rotateX(Math.PI / 2), m, this.max);
      for (const x of [L, R, body]) { x.count = 0; x.frustumCulled = false; x.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.scene.add(x); }
      return { L, R, body, n: 0 };
    };
    this.dark = mk(0x1c1a18);
    this.light = mk(0xe8e6e0);
    this.spawnT = 2;
    this.moteT = 0;
    this.m4 = new THREE.Matrix4();
  }

  update(dt) {
    const g = this.game, P = g.player, env = g.env;
    if (!P) return;
    const hour = env.hour, day = hour > 6.2 && hour < 19.5, night = hour < 5.5 || hour > 20.5;
    const L = env.local || {};
    const storm = (L.rain || 0) > 0.5 || (L.snow || 0) > 0.5 || (L.sand || 0) > 0.4 || (L.tornado || 0) > 0.2;
    const reg = P.region || regionAt(P.pos.x, P.pos.z);

    // ---- birds
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = rnd(8, 18);
      if (day && !storm && this.flocks.length < 3) {
        const a = Math.random() * Math.PI * 2, d = rnd(120, 280);
        const c = V(P.pos.x + Math.cos(a) * d, 0, P.pos.z + Math.sin(a) * d);
        const kind = reg === 'beach' ? 'gull' : reg === 'n' ? 'crow' : Math.random() < 0.5 ? 'crow' : 'swallow';
        this.flocks.push(new Flock(c, kind === 'gull' ? Math.floor(rnd(3, 7)) : Math.floor(rnd(6, 14)), kind));
      }
    }
    for (const f of [this.dark, this.light]) f.n = 0;
    for (let i = this.flocks.length - 1; i >= 0; i--) {
      const F = this.flocks[i];
      F.life -= dt;
      F.center.addScaledVector(F.drift, dt);
      const far = Math.hypot(F.center.x - P.pos.x, F.center.z - P.pos.z) > 650;
      if (F.life <= 0 || far || storm) { this.flocks.splice(i, 1); continue; }
      const gy = heightAt(F.center.x, F.center.z);
      const set = F.kind === 'gull' ? this.light : this.dark;
      for (const b of F.birds) {
        if (set.n >= this.max) break;
        b.a += b.sp * dt * (F.kind === 'swallow' ? 1.8 : 1);
        const wob = Math.sin(b.a * 3 + b.ph) * 4;
        const x = F.center.x + Math.cos(b.a) * (b.r + wob), z = F.center.z + Math.sin(b.a) * (b.r + wob);
        const y = gy + F.alt + b.h + Math.sin(b.a * 2 + b.ph) * 3;
        // heading along the circle
        const yaw = -b.a + (b.sp > 0 ? 0 : Math.PI);
        // flap in bursts, then glide
        b.glide -= dt;
        if (b.glide < -rnd(1, 3)) b.glide = rnd(1, 2.5);
        const flap = b.glide > 0 ? 0.12 : Math.sin(g.time * (F.kind === 'gull' ? 7 : 13) + b.ph) * 0.9;
        const s = F.kind === 'gull' ? 1.6 : F.kind === 'crow' ? 1.15 : 0.8;
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, yaw, -Math.cos(b.a * 2 + b.ph) * 0.15, 'YXZ'));
        const pos = V(x, y, z), sc = V(s, s, s);
        this.m4.compose(pos, q, sc); set.body.setMatrixAt(set.n, this.m4);
        const qw = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, flap));
        this.m4.compose(pos, q.clone().multiply(qw), sc); set.R.setMatrixAt(set.n, this.m4);
        qw.setFromEuler(new THREE.Euler(0, 0, -flap));
        this.m4.compose(pos, q.clone().multiply(qw), sc); set.L.setMatrixAt(set.n, this.m4);
        set.n++;
      }
      // a call now and then
      if (Math.random() < dt * 0.25 && g.audio.birdCall) g.audio.birdCall(F.kind, F.center.distanceTo(P.pos));
    }
    for (const f of [this.dark, this.light]) {
      for (const k of ['L', 'R', 'body']) { f[k].count = f.n; f[k].instanceMatrix.needsUpdate = true; }
    }

    // ---- motes around the player
    const fx = g.effects, cam = g.camera.position;
    this.moteT -= dt;
    if (this.moteT <= 0 && !storm) {
      this.moteT = 0.12;
      const around = () => V(cam.x + rnd(-14, 14), cam.y + rnd(-1.5, 4), cam.z + rnd(-14, 14));
      if (night && (reg === 's' || reg === 'e' || reg === 'hub')) {
        // fireflies: slow, wandering, blinking
        if (Math.random() < 0.7) fx.glow.emit({ pos: around(), vel: V(rnd(-0.3, 0.3), rnd(-0.1, 0.2), rnd(-0.3, 0.3)), color: [1.2, 1.5, 0.35], life: rnd(1.5, 3.5), size: 0.07, alpha: 0.9, fadeIn: 0.4, drag: 0.2 });
      } else if (day && (reg === 's' || reg === 'e' || reg === 'hub')) {
        // pollen and dust motes catching the light
        fx.glow.emit({ pos: around(), vel: V(rnd(-0.25, 0.25), rnd(-0.05, 0.12), rnd(-0.25, 0.25)), color: [1.0, 0.95, 0.75], life: rnd(3, 6), size: 0.025, alpha: 0.5, fadeIn: 0.3, drag: 0.1 });
      } else if (reg === 'n') {
        fx.glow.emit({ pos: around(), vel: V(rnd(-0.6, 0.6), rnd(-0.4, -0.1), rnd(-0.6, 0.6)), color: [0.9, 0.95, 1.1], life: rnd(2, 4), size: 0.02, alpha: 0.7, fadeIn: 0.2 });
      } else if (reg === 'w' && Math.random() < 0.4) {
        const p = V(cam.x + rnd(-20, 20), 0, cam.z + rnd(-20, 20)); p.y = heightAt(p.x, p.z) + 0.2;
        fx.smoke.emit({ pos: p, vel: V(2.5, 0.2, 0.8), color: [0.85, 0.75, 0.55], life: rnd(1.5, 3), size: 0.3, grow: 1.8, alpha: 0.25, drag: 0.3 });
      }
    }

    // ---- soundscape
    if (g.audio.ambience) g.audio.ambience(dt, { reg, day, night, wind: (g.env.windStrength ?? 1) + (L.sand || 0) * 2 + (L.snow || 0) * 1.5 + (L.tornado || 0) * 3, rain: L.rain || 0 });
  }
}
