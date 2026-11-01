// An animated person built from a Quaternius model + retargeted clips.
import * as THREE from 'three';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const ONCE = new Set(['Jump_Start', 'Jump_Land', 'Pistol_Shoot', 'Pistol_Reload', 'Punch_Jab', 'Punch_Cross', 'Hit_Chest', 'Death01', 'Interact']);

export class Human {
  constructor(lib, id, opts = {}) {
    const t = lib.people[id] || Object.values(lib.people)[0];
    this.id = id;
    this.root = new THREE.Group();
    this.model = cloneSkinned(t.scene);
    this.root.add(this.model);
    this.clips = lib.clips[t.family];
    this.mixer = new THREE.AnimationMixer(this.model);
    this.actions = {};
    this.current = null;
    this.locked = 0; // seconds a one-shot clip keeps control
    this.model.traverse((o) => {
      if (o.isSkinnedMesh) {
        o.frustumCulled = !opts.alwaysVisible;
        if (!opts.alwaysVisible) { o.geometry.computeBoundingSphere(); o.geometry.boundingSphere.radius = Math.max(o.geometry.boundingSphere.radius, 1.2); }
      }
    });
    this.handR = this.model.getObjectByName('HandR');
    this.head = this.model.getObjectByName('Head');
    this.mixer.addEventListener('finished', (e) => { if (e.action === this.current) this.locked = 0; });
    this.play('Idle_Loop', 0);
  }

  action(name) {
    if (!this.actions[name]) {
      const clip = this.clips[name];
      if (!clip) return null;
      const a = this.mixer.clipAction(clip);
      if (ONCE.has(name)) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
      this.actions[name] = a;
    }
    return this.actions[name];
  }

  // Cross-fade to a clip. `force` restarts a one-shot even if it is playing.
  play(name, fade = 0.2, speed = 1, force = false) {
    const a = this.action(name);
    if (!a) return;
    a.timeScale = speed;
    if (this.current === a && !force) return;
    if (this.locked > 0 && !force) return;
    a.reset();
    a.enabled = true;
    a.setEffectiveWeight(1);
    a.play();
    if (this.current && this.current !== a) this.current.crossFadeTo(a, fade, false);
    this.current = a;
    if (ONCE.has(name)) this.locked = a.getClip().duration / Math.max(speed, 0.01);
  }

  update(dt) {
    if (this.locked > 0) this.locked -= dt;
    this.mixer.update(dt);
  }

  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); }
}

// Pick a locomotion clip and playback speed for a ground speed (m/s)
export function locomotion(speed) {
  if (speed < 0.25) return ['Idle_Loop', 1];
  if (speed < 2.4) return ['Walk_Loop', speed / 1.5];
  if (speed < 5.2) return ['Jog_Fwd_Loop', speed / 3.6];
  return ['Sprint_Loop', speed / 6.5];
}
