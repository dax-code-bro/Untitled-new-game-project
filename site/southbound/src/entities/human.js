// An animated person built from a Quaternius model + retargeted clips.
import * as THREE from 'three';
import { Ragdoll } from './ragdoll.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const ONCE = new Set(['Jump_Start', 'Jump_Land', 'Pistol_Shoot', 'Pistol_Reload', 'Punch_Jab', 'Punch_Cross', 'Hit_Chest', 'Death01', 'Interact']);

const _fq = new THREE.Quaternion();
// The run's arm swing, softened. The library's jog and sprint throw the arms through a huge arc and
// pull the shoulders far back on every stride: stiff and robotic. Each frame the shoulders and upper
// arms are drawn part of the way toward their average pose over the cycle, which shrinks the swing
// around its middle (k: how much; shoulders more than arms) without changing the rhythm.
const SWING = { Jog_Fwd_Loop: 0.42, Sprint_Loop: 0.36 };
const SWING_BONES = [['clavicleL', 1.6], ['clavicleR', 1.6], ['shoulder01L', 1.6], ['shoulder01R', 1.6], ['upperarm01L', 1], ['upperarm01R', 1], ['upperarm02L', 1], ['upperarm02R', 1]];
const MEANS = new WeakMap(); // clip -> { boneName: mean quaternion }
function clipMeans(clip) {
  let m = MEANS.get(clip);
  if (m) return m;
  m = {};
  for (const [name] of SWING_BONES) {
    const t = clip.tracks.find((tr) => tr.name === name + '.quaternion');
    if (!t) continue;
    const v = t.values, q = new THREE.Vector4(), q0 = new THREE.Vector4(v[0], v[1], v[2], v[3]);
    for (let i = 0; i < v.length; i += 4) {
      const s = v[i] * q0.x + v[i + 1] * q0.y + v[i + 2] * q0.z + v[i + 3] * q0.w < 0 ? -1 : 1;
      q.x += v[i] * s; q.y += v[i + 1] * s; q.z += v[i + 2] * s; q.w += v[i + 3] * s;
    }
    q.normalize();
    m[name] = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  }
  MEANS.set(clip, m);
  return m;
}
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
    this.handR = this.model.getObjectByName('HandR') || this.model.getObjectByName('wristR');
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

  // Blend a second clip on top of the current one (0 = off), e.g. a hunch for a limp.
  layer(name, w) {
    const a = this.action(name);
    if (!a || a === this.current) return;
    if (w > 0.001) {
      if (!a.isRunning()) { a.reset(); a.enabled = true; a.play(); }
      a.setEffectiveWeight(w);
    } else if (a.isRunning()) a.stop();
  }

  update(dt) {
    if (this.ragdoll) { this.stepRagdoll(dt); return; }
    if (this.locked > 0) this.locked -= dt;
    this.mixer.update(dt);
    this.softenSwing();
    if (this.post) this.post(dt); // pose tweaks on top of the clip (hands up, etc.)
    if (this.flinchT > 0) this.applyFlinch(dt);
  }

  softenSwing() {
    const cur = this.current, clip = cur && cur.getClip(), k = clip && SWING[clip.name];
    if (!k) return;
    const w = cur.getEffectiveWeight();
    if (w < 0.01) return;
    const means = clipMeans(clip);
    if (!this._swing) this._swing = SWING_BONES.map(([n, f]) => [this.model.getObjectByName(n), n, f]).filter((b) => b[0]);
    for (const [bone, name, f] of this._swing) { const m = means[name]; if (m) bone.quaternion.slerp(m, Math.min(0.85, k * f) * w); }
  }

  // Physics takes over (entities/ragdoll.js). ground(x, z, y) -> height. Returns false if this
  // skeleton can't be ragdolled (then the death clip plays as before).
  goLimp(ground) {
    if (this.ragdoll) return true;
    const r = new Ragdoll(this.model, ground);
    if (!r.ok) return false;
    this.rest = Object.values(r.b).map((b) => [b, b.position.clone(), b.quaternion.clone()]); // to stand up again (the player)
    this.mixer.stopAllAction();
    this.post = null;
    this.ragdoll = r; this.ground = ground;
    return true;
  }
  endRagdoll() {
    if (!this.ragdoll) return;
    for (const [b, p, q] of this.rest) { b.position.copy(p); b.quaternion.copy(q); }
    this.ragdoll = null; this.rest = null; this.locked = 0;
  }
  stepRagdoll(dt) {
    const r = this.ragdoll;
    if (r.done) return;
    r.step(dt);
    // the character's root follows the body (so it's drawn and culled where it actually lies)
    const pel = r.p.pelvis;
    this.root.position.set(pel.x, this.ground(pel.x, pel.z, pel.y + 0.5), pel.z);
    this.root.updateMatrixWorld(true);
    r.pose();
  }

  // A hit someone survives: the part that was hit jerks away from the shot for a moment
  // (head snaps back, a shoulder twists, a knee buckles), on top of whatever they're doing.
  flinch(part, side = 'R', strength = 1) {
    const pick = { head: ['head', 'Head', 'neck01'], torso: ['spine02', 'spine03', 'Spine1', 'Chest'], arm: [side === 'L' ? 'upperarm01L' : 'upperarm01R', side === 'L' ? 'UpperArm.L' : 'UpperArm.R'],
      leg: [side === 'L' ? 'upperleg01L' : 'upperleg01R', side === 'L' ? 'UpperLeg.L' : 'UpperLeg.R'] }[part] || ['spine02', 'Chest'];
    let bone = null; for (const n of pick) { bone = this.model.getObjectByName(n); if (bone) break; }
    if (!bone) return;
    this.flinchBone = bone; this.flinchT = 0.35; this.flinchMax = 0.35;
    const a = (part === 'head' ? 0.55 : part === 'leg' ? 0.45 : 0.4) * strength;
    this.flinchAxis = part === 'arm' ? new THREE.Vector3(0, side === 'L' ? 1 : -1, 0) : part === 'leg' ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(-1, 0, 0);
    this.flinchAngle = a;
  }
  applyFlinch(dt) {
    this.flinchT -= dt;
    const k = Math.max(0, this.flinchT / this.flinchMax);
    const e = Math.sin(Math.min(1, (1 - k) * 4) * Math.PI * 0.5) * k; // snaps out fast, eases back
    this.flinchBone.quaternion.multiply(_fq.setFromAxisAngle(this.flinchAxis, this.flinchAngle * e));
  }

  // Free what this person holds on the graphics card: each skinned mesh's skeleton keeps a small
  // "bone texture" that three.js never frees on its own. Removed people left one behind every
  // time, so a long session piled up hundreds. Safe for someone who comes back: the bone texture
  // is made again the next time they're drawn
  freeGpu() { this.model.traverse((o) => { if (o.isSkinnedMesh && o.skeleton?.boneTexture) o.skeleton.dispose(); }); }
  dispose() { this.mixer.stopAllAction(); this.mixer.uncacheRoot(this.model); this.freeGpu(); }
}

// Pick a locomotion clip and playback speed for a ground speed (m/s)
export function locomotion(speed) {
  if (speed < 0.25) return ['Idle_Loop', 1];
  if (speed < 2.4) return ['Walk_Loop', speed / 1.5];
  if (speed < 5.2) return ['Jog_Fwd_Loop', speed / 3.6];
  return ['Sprint_Loop', speed / 6.5];
}
