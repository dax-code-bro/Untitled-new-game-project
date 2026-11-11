// A2: little scenes instead of toasts. Anything you do with your hands or with another person is acted
// out: you walk up, turn to them, reach, knock, hand things over, take things; the other person does
// their part at the same time.
//
//   game.acts.play(beats, { done(ok), camera })   runs the beats one after another while your controls
//                                                 are locked (the S.doorWalk slot, like the doors)
//   beat = { walk: {x,z}, speed, face: {x,z} }    walk there (snaps after `max` seconds), then face
//        | { face: {x,z} | yaw, t }               turn
//        | { clip, speed, t, loop }               play a clip (one-shots are forced) and wait t
//        | { pose: 'crouch'|'kneel'|'sit'|'idle', t }
//        | { wait: t }
//   every beat may also have: start(ctx), end(ctx), each(dt, k, ctx) (per frame: move other people),
//   ik(F, k, ctx) (per frame: your arms; F = gunPose.frame), t (its length), say: [who, line]
//
//   game.acts.person(at, heading, id)  someone to act with (a Human you drive: walk/face/clip/reach/hold)
//   game.acts.prop(kind)               box, parcel, newspaper, pizza, cash, cuffs, ticket, keys, bag, card
//   game.acts.doorstep(spot, item, opts) the whole delivery: to the door, knock, they open, hand it over
import * as THREE from 'three';
import { Human } from '../entities/human.js';
import { GunPose } from '../entities/gunpose.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wrapA = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const smooth = (k) => k * k * (3 - 2 * k);
const _v = new THREE.Vector3(), _w = new THREE.Vector3();

// ---------------- props (made once per kind, cloned per use)
const PROTO = {};
function mat(color, rough = 0.85, metal = 0) { return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal }); }
function makeProp(kind) {
  const g = new THREE.Group();
  const add = (geo, m, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (kind === 'box' || kind === 'parcel') {
    add(new THREE.BoxGeometry(0.36, 0.24, 0.28), mat(0xa57a4a, 0.92));
    add(new THREE.BoxGeometry(0.365, 0.03, 0.285), mat(kind === 'parcel' ? 0x2e7d5b : 0xc9b48a, 0.6), 0, 0.02, 0);
    add(new THREE.BoxGeometry(0.12, 0.002, 0.08), mat(0xf2f2ee, 0.7), 0.08, 0.121, 0.05); // the label
  } else if (kind === 'pizza') {
    add(new THREE.BoxGeometry(0.38, 0.05, 0.38), mat(0xd8c7a0, 0.9));
    add(new THREE.BoxGeometry(0.2, 0.002, 0.12), mat(0xb3261e, 0.7), 0, 0.026, 0);
  } else if (kind === 'newspaper') {
    // folded and rolled with a rubber band
    const r = add(new THREE.CylinderGeometry(0.035, 0.035, 0.3, 10), mat(0xe9e4d6, 0.95)); r.rotation.z = Math.PI / 2;
    const b = add(new THREE.CylinderGeometry(0.037, 0.037, 0.015, 10), mat(0xc0392b, 0.6)); b.rotation.z = Math.PI / 2;
  } else if (kind === 'cash') {
    add(new THREE.BoxGeometry(0.155, 0.012, 0.066), mat(0x6f8f5e, 0.8));
    add(new THREE.BoxGeometry(0.03, 0.014, 0.068), mat(0xe8e0c8, 0.7));
  } else if (kind === 'cuffs') {
    const ringM = mat(0xb9bec4, 0.3, 1);
    for (const s of [-1, 1]) { const r = add(new THREE.TorusGeometry(0.038, 0.007, 6, 14), ringM, s * 0.05, 0, 0); r.rotation.y = Math.PI / 2; }
    add(new THREE.BoxGeometry(0.06, 0.008, 0.008), ringM);
  } else if (kind === 'ticket' || kind === 'card' || kind === 'papers') {
    add(new THREE.BoxGeometry(kind === 'card' ? 0.085 : 0.11, 0.002, kind === 'card' ? 0.054 : 0.16), mat(kind === 'card' ? 0x2a4a7a : 0xf4f1e8, 0.8));
  } else if (kind === 'keys') {
    add(new THREE.TorusGeometry(0.018, 0.003, 5, 12), mat(0xc9ccd0, 0.3, 1));
    add(new THREE.BoxGeometry(0.012, 0.05, 0.003), mat(0xb08d3a, 0.35, 1), 0, -0.035, 0);
  } else if (kind === 'bag') {
    add(new THREE.BoxGeometry(0.26, 0.3, 0.14), mat(0xb89b6e, 0.95), 0, 0, 0);
  } else if (kind === 'bandage') {
    const r = add(new THREE.CylinderGeometry(0.03, 0.03, 0.07, 14), mat(0xf2f0ea, 0.95)); r.rotation.z = Math.PI / 2;
  } else if (kind === 'knife') {
    add(new THREE.BoxGeometry(0.02, 0.1, 0.028), mat(0x3a2a1c, 0.7), 0, -0.04, 0);
    add(new THREE.BoxGeometry(0.004, 0.13, 0.024), mat(0xc9ccd0, 0.25, 1), 0, 0.075, 0.002);
  } else if (kind === 'hammer') {
    add(new THREE.CylinderGeometry(0.014, 0.016, 0.3, 8), mat(0x8a5a2e, 0.7), 0, 0.0, 0);
    add(new THREE.BoxGeometry(0.11, 0.035, 0.035), mat(0x2b2d30, 0.4, 0.9), 0, 0.15, 0);
  } else if (kind === 'wrench') {
    add(new THREE.BoxGeometry(0.022, 0.24, 0.008), mat(0xb8bcc2, 0.3, 1), 0, 0.03, 0);
    add(new THREE.TorusGeometry(0.022, 0.008, 5, 10, Math.PI * 1.4), mat(0xb8bcc2, 0.3, 1), 0, 0.16, 0);
  } else if (kind === 'screwdriver') {
    add(new THREE.CylinderGeometry(0.016, 0.014, 0.1, 8), mat(0xd8a020, 0.5), 0, -0.02, 0);
    add(new THREE.CylinderGeometry(0.004, 0.004, 0.12, 6), mat(0xb8bcc2, 0.3, 1), 0, 0.09, 0);
  } else if (kind === 'flashlight') {
    add(new THREE.CylinderGeometry(0.02, 0.018, 0.2, 10), mat(0x1c1c1e, 0.5, 0.4), 0, 0.02, 0);
    add(new THREE.CylinderGeometry(0.028, 0.02, 0.05, 10), mat(0x1c1c1e, 0.5, 0.4), 0, 0.14, 0);
  } else if (kind === 'shovel') {
    add(new THREE.CylinderGeometry(0.014, 0.014, 1.0, 8), mat(0x8a5a2e, 0.7), 0, 0.2, 0);
    add(new THREE.BoxGeometry(0.2, 0.26, 0.02), mat(0x55585c, 0.5, 0.8), 0, -0.4, 0.03);
  } else if (kind === 'chainsaw' || kind === 'trimmer') {
    add(new THREE.BoxGeometry(0.14, 0.18, 0.3), mat(kind === 'chainsaw' ? 0xd06a1a : 0x2f7a3a, 0.5), 0, 0, 0);
    add(new THREE.BoxGeometry(0.03, 0.06, kind === 'chainsaw' ? 0.45 : 0.9), mat(0x9a9ea4, 0.35, 0.9), 0, -0.02, kind === 'chainsaw' ? 0.36 : 0.55);
  } else if (kind === 'bin') {
    add(new THREE.BoxGeometry(0.58, 1.0, 0.7), mat(0x2f5a34, 0.7), 0, 0.5, 0);
    add(new THREE.BoxGeometry(0.6, 0.05, 0.74), mat(0x264a2a, 0.7), 0, 1.02, 0);
  } else if (kind === 'jerrycan') {
    add(new THREE.BoxGeometry(0.17, 0.3, 0.24), mat(0xb3261e, 0.45, 0.2), 0, 0, 0);
    add(new THREE.CylinderGeometry(0.018, 0.018, 0.09, 8), mat(0x2b2d30, 0.5), 0, 0.17, 0.07);
  } else if (kind === 'bowl') {
    add(new THREE.CylinderGeometry(0.075, 0.05, 0.06, 16), mat(0xe8e2d4, 0.7), 0, 0, 0);
    add(new THREE.CylinderGeometry(0.068, 0.068, 0.01, 16), mat(0x7a4a22, 0.6), 0, 0.022, 0);
  } else if (kind === 'axe') {
    add(new THREE.CylinderGeometry(0.016, 0.018, 0.7, 8), mat(0x8a5a2e, 0.7), 0, 0.05, 0);
    add(new THREE.BoxGeometry(0.03, 0.12, 0.16), mat(0x55585c, 0.4, 0.9), 0, 0.36, 0.05);
  } else if (kind === 'bucket') {
    add(new THREE.CylinderGeometry(0.13, 0.1, 0.26, 16, 1, true), mat(0x8a9096, 0.4, 0.8), 0, 0, 0);
    add(new THREE.CylinderGeometry(0.12, 0.12, 0.01, 16), mat(0x3a5a70, 0.2), 0, 0.08, 0);
  } else if (kind === 'phone') {
    add(new THREE.BoxGeometry(0.072, 0.15, 0.009), mat(0x111214, 0.3, 0.2));
    add(new THREE.BoxGeometry(0.064, 0.13, 0.002), mat(0x1d3550, 0.15, 0), 0, 0, 0.0055); // the screen
  } else if (kind === 'cup') {
    add(new THREE.CylinderGeometry(0.04, 0.032, 0.11, 12), mat(0xf2efe8, 0.8));
  } else add(new THREE.BoxGeometry(0.2, 0.15, 0.15), mat(0x888888)); // (anything else: a small package)
  g.userData.kind = kind;
  return g;
}
export function prop(kind) { if (!PROTO[kind]) PROTO[kind] = makeProp(kind); const p = PROTO[kind].clone(); p.userData.kind = kind; return p; }
// how a prop is carried: in both hands in front of the chest, or in one hand
const TWO_HANDS = new Set(['box', 'parcel', 'pizza', 'bag']);

export function installActs(game) {
  const { S, player, collision, scene } = game;
  const gp = () => game.gunPose;
  const surf = (x, z, y) => collision.surface(x, z, y + 0.6);

  // ---------- someone to act with
  function person(at, heading = 0, id = null, opts = {}) {
    const lib = game.lib;
    const h = opts.h || new Human(lib, id || lib.peopleIds[(Math.random() * lib.peopleIds.length) | 0]);
    const A = {
      h, pos: new THREE.Vector3(at.x, at.y ?? surf(at.x, at.z, 50), at.z), heading, pose: null, held: null, heldTwo: false, ik: null, own: !opts.h,
      walk(to, dt, sp = 1.3) { // true once there
        const dx = to.x - A.pos.x, dz = to.z - A.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.12) { A.h.play('Idle_Loop', 0.25); return true; }
        A.heading += wrapA(Math.atan2(dx, dz) - A.heading) * Math.min(1, dt * 8);
        const s = Math.min(sp, d * 4);
        A.pos.x += (dx / d) * s * dt; A.pos.z += (dz / d) * s * dt;
        A.pos.y = to.y ?? surf(A.pos.x, A.pos.z, A.pos.y);
        A.h.play(sp > 2.2 ? 'Jog_Fwd_Loop' : 'Walk_Loop', 0.2, sp > 2.2 ? 1 : clamp(sp / 1.3, 0.6, 1.3));
        return false;
      },
      face(to, dt) { A.heading += wrapA(Math.atan2(to.x - A.pos.x, to.z - A.pos.z) - A.heading) * Math.min(1, dt * 8); },
      hold(mesh, two = TWO_HANDS.has(mesh?.userData?.kind)) { if (A.held && A.held !== mesh) A.held.parent?.remove(A.held); A.held = mesh; A.heldTwo = two; if (mesh && !mesh.parent) scene.add(mesh); },
      drop() { const m = A.held; A.held = null; return m; },
      // per frame: body, arms (IK), whatever they hold. `ext` = false when something else updates h
      sync(dt, ext = false) {
        if (!ext) A.h.update(dt);
        A.h.root.position.copy(A.pos); A.h.root.rotation.y = A.heading;
        if (A.ik || A.held) {
          A.h.root.updateMatrixWorld(true);
          if (!A.pose) A.pose = new GunPose(A.h);
          if (A.pose.ok) {
            const F = A.pose.frame(A.heading);
            if (A.ik) A.ik(F, A.pose);
            else if (A.held) carry(A.pose, F, A.held, A.heldTwo, 0.34);
          }
        }
      },
      remove() { scene.remove(A.h.root); if (A.held) scene.remove(A.held); if (A.own) A.h.dispose?.(); },
    };
    if (!opts.h) { A.h.root.position.copy(A.pos); A.h.root.rotation.y = heading; A.h.play('Idle_Loop', 0); scene.add(A.h.root); }
    return A;
  }

  // someone already walking the streets (peds.list): their body is animated by peds.update, so the arms
  // go on top in h.post; release() hands them back to their own life
  function fromPed(p) {
    const prevScripted = p.scripted, prevPost = p.h.post;
    p.scripted = true;
    const A = {
      h: p.h, ped: p, pose: null, held: null, heldTwo: false, ik: null,
      get pos() { return p.pos; }, get heading() { return p.heading; }, set heading(v) { p.heading = v; },
      walk(to, dt, sp = 1.3) {
        const dx = to.x - p.pos.x, dz = to.z - p.pos.z, d = Math.hypot(dx, dz);
        if (d < 0.12) { p.h.play('Idle_Loop', 0.25); return true; }
        p.heading += wrapA(Math.atan2(dx, dz) - p.heading) * Math.min(1, dt * 8);
        const s = Math.min(sp, d * 4); p.pos.x += (dx / d) * s * dt; p.pos.z += (dz / d) * s * dt; p.pos.y = surf(p.pos.x, p.pos.z, p.pos.y);
        p.h.play('Walk_Loop', 0.2, clamp(sp / 1.3, 0.6, 1.3)); return false;
      },
      face(to, dt) { p.heading += wrapA(Math.atan2(to.x - p.pos.x, to.z - p.pos.z) - p.heading) * Math.min(1, dt * 8); },
      hold(mesh, two = TWO_HANDS.has(mesh?.userData?.kind)) { if (A.held && A.held !== mesh) A.held.parent?.remove(A.held); A.held = mesh; A.heldTwo = two; if (mesh && !mesh.parent) scene.add(mesh); },
      drop() { const m = A.held; A.held = null; return m; },
      sync() {},
      release() { p.scripted = prevScripted; p.h.post = prevPost; if (A.held) { A.held.parent?.remove(A.held); A.held = null; } },
      remove() { A.release(); },
    };
    p.h.post = (dt) => {
      prevPost?.(dt);
      if (!A.ik && !A.held) return;
      p.h.root.updateMatrixWorld(true);
      if (!A.pose) A.pose = new GunPose(p.h);
      if (!A.pose.ok) return;
      const F = A.pose.frame(p.heading);
      if (A.ik) A.ik(F, A.pose); else carry(A.pose, F, A.held, A.heldTwo, 0.34);
    };
    return A;
  }
  // a shopkeeper behind a counter (their own system animates them; the arms go on top in h.post)
  function fromHuman(h) {
    const prevPost = h.post;
    const A = {
      h, pose: null, held: null, heldTwo: false, ik: null,
      get pos() { return h.root.getWorldPosition(new THREE.Vector3()); },
      get heading() { return h.root.rotation.y; }, set heading(v) { h.root.rotation.y = v; },
      walk() { return true; },
      face(to, dt) { const p = A.pos; h.root.rotation.y += wrapA(Math.atan2(to.x - p.x, to.z - p.z) - h.root.rotation.y) * Math.min(1, dt * 8); },
      hold(mesh, two = TWO_HANDS.has(mesh?.userData?.kind)) { if (A.held && A.held !== mesh) A.held.parent?.remove(A.held); A.held = mesh; A.heldTwo = two; if (mesh && !mesh.parent) scene.add(mesh); },
      drop() { const m = A.held; A.held = null; return m; },
      sync() {},
      release() { h.post = prevPost; if (A.held) { A.held.parent?.remove(A.held); A.held = null; } },
      remove() { A.release(); },
    };
    h.post = (dt) => {
      prevPost?.(dt);
      if (!A.ik && !A.held) return;
      h.root.updateMatrixWorld(true);
      if (!A.pose) A.pose = new GunPose(h);
      if (!A.pose.ok) return;
      const F = A.pose.frame(h.root.rotation.y);
      if (A.ik) A.ik(F, A.pose); else carry(A.pose, F, A.held, A.heldTwo, 0.34);
    };
    return A;
  }
  // eating: the food to your mouth, a bite at a time, smaller after each one
  function eatBeats(mesh, t = 2.8, bites = 3) {
    return [{ t, start: (ctx) => hold(ctx, mesh), ik: (F, k, ctx, P) => {
      const head = (P.head || P.chest).getWorldPosition(new THREE.Vector3());
      const mouth = head.addScaledVector(F.fw, 0.13).addScaledVector(F.up, -0.07);
      const low = F.chest.clone().addScaledVector(F.fw, 0.3).addScaledVector(F.up, -0.14).addScaledVector(F.right, 0.08);
      const ph = (k * bites) % 1, up = Math.sin(Math.min(1, ph / 0.75) * Math.PI);
      P.reach(P.R, low.lerp(mouth, up), F, 'R'); P.attachToHand(mesh, P.R);
      mesh.scale.setScalar(1 - (Math.floor(k * bites) / bites) * 0.6); mesh.updateMatrixWorld(true);
    } }, { t: 0.2, start: (ctx) => { ctx.held = null; mesh.parent?.remove(mesh); } }];
  }
  // patching yourself up: down on a knee, the bandage wound round the hurt arm, leg or side
  function treatBeats(where = 'side', t = 2.6) {
    const roll = prop('bandage');
    return [{ t, pose: where === 'leg' ? 'crouch' : 'idle', start: (ctx) => hold(ctx, roll), ik: (F, k, ctx, P) => {
      let c;
      if (where === 'leg') c = F.chest.clone().addScaledVector(F.up, -0.62).addScaledVector(F.fw, 0.28).addScaledVector(F.right, 0.14);
      else if (where === 'arm') { c = P.L.lower.getWorldPosition(new THREE.Vector3()); P.reach(P.L, F.chest.clone().addScaledVector(F.fw, 0.36).addScaledVector(F.right, -0.18).addScaledVector(F.up, -0.06), F, 'L'); }
      else c = F.chest.clone().addScaledVector(F.right, 0.16).addScaledVector(F.up, -0.18).addScaledVector(F.fw, 0.08);
      // round and round it
      const a = k * Math.PI * 2 * 4, r = 0.07;
      const at = c.clone().addScaledVector(F.right, Math.cos(a) * r).addScaledVector(F.fw, Math.sin(a) * r * 0.6).addScaledVector(F.up, (k - 0.5) * 0.06);
      P.reach(P.R, at, F, 'R'); P.attachToHand(roll, P.R);
      if (where !== 'arm') P.reach(P.L, c.clone().addScaledVector(F.right, -0.09), F, 'L');
    } }, { t: 0.3, pose: 'idle', start: (ctx) => { ctx.held = null; roll.parent?.remove(roll); } }];
  }
  // down to pick something up off the ground and into your hand
  function pickupBeats(mesh, at, t = 1.0) {
    return [{ face: at, t: 0.25 }, { t, pose: 'crouch', ik: (F, k, ctx, P) => {
      const g = new THREE.Vector3(at.x, at.y ?? player.pos.y, at.z);
      const reach = smooth(clamp(k * 2.2, 0, 1)), lift = smooth(clamp((k - 0.55) / 0.45, 0, 1));
      const hand = F.chest.clone().addScaledVector(F.fw, 0.28).addScaledVector(F.up, -0.2).lerp(g.clone().add(_v.set(0, 0.05, 0)), reach * (1 - lift)).lerp(F.chest.clone().addScaledVector(F.fw, 0.25).addScaledVector(F.up, -0.25), lift * 0.6);
      P.reach(P.R, hand, F, 'R');
      if (mesh && k > 0.5) { mesh.position.copy(P.R.wrist.getWorldPosition(new THREE.Vector3())); mesh.updateMatrixWorld(true); }
    } }, { t: 0.25, pose: 'idle' }];
  }
  // a wave: the right hand up beside your face, a couple of turns of the wrist
  function waveBeats(at, t = 1.1) {
    return [{ face: at, t: 0.25 }, { t, ik: (F, k, ctx, P) => {
      const sh = P.R.upper.getWorldPosition(new THREE.Vector3()), e = Math.sin(clamp(k, 0, 1) * Math.PI);
      const hand = sh.clone().addScaledVector(F.up, 0.05 + 0.35 * e).addScaledVector(F.right, 0.2 + Math.sin(k * Math.PI * 6) * 0.06 * e).addScaledVector(F.fw, 0.12);
      P.reach(P.R, hand, F, 'R');
    } }];
  }
  // on your knees over something on the ground, a knife working at it
  function knifeBeats(at, t = 3.0, knife = null) {
    const k0 = knife || prop('knife');
    return [{ face: at, t: 0.3 }, { t, pose: 'crouch', start: (ctx) => hold(ctx, k0), ik: (F, k, ctx, P) => {
      const g = new THREE.Vector3(at.x, (at.y ?? player.pos.y) + 0.22, at.z);
      const cut = g.clone().addScaledVector(F.right, Math.sin(k * Math.PI * 7) * 0.12).addScaledVector(F.fw, Math.cos(k * Math.PI * 3.5) * 0.05);
      P.reach(P.R, cut, F, 'R'); P.attachToHand(k0, P.R);
      P.reach(P.L, g.clone().addScaledVector(F.right, -0.18).addScaledVector(F.fw, 0.05), F, 'L');
    } }, { t: 0.3, pose: 'idle', start: (ctx) => { ctx.held = null; k0.parent?.remove(k0); } }];
  }
  // a job's work at a spot, its tool in your hands for t seconds: how the hands move depends on the tool
  //  hammer (a nail, chest high), wrench (a bolt, turning), screwdriver (a panel), shovel (two hands, digging),
  //  chainsaw / trimmer (two hands, sweeping), flashlight (shone ahead, the other hand trying the door),
  //  bin (lifted with both hands and tipped)
  function workBeats(at, tool, t = 4, low = false) {
    const k0 = prop(tool), two = tool === 'shovel' || tool === 'chainsaw' || tool === 'trimmer' || tool === 'bin' || tool === 'axe';
    const W = { t, pose: low ? 'crouch' : 'idle', start: (ctx) => { ctx.held = null; scene.add(k0); }, ik: (F, k, ctx, P) => {
      const T = k * t, g = new THREE.Vector3(at.x, (at.y ?? player.pos.y) + (low ? 0.35 : 1.15), at.z);
      const front = F.chest.clone().addScaledVector(F.fw, 0.42).addScaledVector(F.up, low ? -0.45 : -0.1);
      const work = front.lerp(g, 0.35);
      let R = work.clone(), L = work.clone().addScaledVector(F.right, -0.16);
      if (tool === 'hammer' || tool === 'axe') { const ax = tool === 'axe'; R.addScaledVector(F.up, Math.abs(Math.sin(T * Math.PI * (ax ? 1.2 : 2.4))) * (ax ? 0.5 : 0.22)).addScaledVector(F.right, 0.06); if (ax) L = R.clone().addScaledVector(F.up, -0.12).addScaledVector(F.right, -0.05); }
      else if (tool === 'wrench') R.addScaledVector(F.right, 0.05 + Math.cos(T * 7) * 0.06).addScaledVector(F.up, Math.sin(T * 7) * 0.06);
      else if (tool === 'screwdriver') R.addScaledVector(F.fw, 0.04 + Math.sin(T * 9) * 0.015);
      else if (tool === 'shovel') { const d = Math.sin(T * Math.PI * 1.1); R = work.clone().addScaledVector(F.up, 0.3 + d * 0.15).addScaledVector(F.right, 0.08); L = work.clone().addScaledVector(F.up, -0.05 + d * 0.15).addScaledVector(F.fw, 0.1); }
      else if (tool === 'chainsaw' || tool === 'trimmer') { const s = Math.sin(T * (tool === 'trimmer' ? 2.2 : 0.9)) * (tool === 'trimmer' ? 0.35 : 0.12); R = work.clone().addScaledVector(F.right, 0.12 + s).addScaledVector(F.up, tool === 'trimmer' ? -0.35 : 0); L = R.clone().addScaledVector(F.right, -0.24).addScaledVector(F.fw, 0.12); }
      else if (tool === 'flashlight') { R = F.chest.clone().addScaledVector(F.fw, 0.4).addScaledVector(F.right, 0.12); L = g.clone().addScaledVector(F.right, -0.1).addScaledVector(F.up, -0.1).addScaledVector(F.fw, Math.sin(T * 12) * 0.015); }
      else if (tool === 'bin') { const lift = Math.sin(clamp(k, 0, 1) * Math.PI); R = front.clone().addScaledVector(F.right, 0.28).addScaledVector(F.up, lift * 0.45); L = front.clone().addScaledVector(F.right, -0.28).addScaledVector(F.up, lift * 0.45); }
      P.reach(P.R, R, F, 'R'); if (two || tool === 'flashlight' || tool === 'screwdriver' || tool === 'wrench') P.reach(P.L, L, F, 'L');
      if (tool === 'bin') { k0.position.copy(R).lerp(L, 0.5).addScaledVector(F.up, -0.55).addScaledVector(F.fw, 0.32); k0.rotation.set(-Math.sin(clamp(k, 0, 1) * Math.PI) * 1.1, Math.atan2(F.fw.x, F.fw.z), 0); k0.updateMatrixWorld(true); }
      else { P.attachToHand(k0, P.R); if (tool === 'chainsaw' || tool === 'trimmer' || tool === 'shovel') { k0.rotateX(-Math.PI / 2); k0.updateMatrixWorld(true); } }
      if ((tool === 'hammer' || tool === 'axe') && Math.floor(T * (tool === 'axe' ? 1.2 : 2.4)) !== Math.floor((T - 1 / 60) * (tool === 'axe' ? 1.2 : 2.4))) game.audio?.thud?.(tool === 'axe' ? 0.3 : 0.12);
    }, end: () => k0.parent?.remove(k0) };
    return [{ face: at, t: 0.3 }, W, { t: 0.25, pose: 'idle' }];
  }
  // the screen goes dark for a while (title + a line), then comes back
  let fadeEl = null;
  function fade(on, title = '', line = '') {
    if (!fadeEl) { fadeEl = document.createElement('div'); fadeEl.className = 'sbfade'; fadeEl.innerHTML = '<b style="font:800 28px Inter,system-ui,sans-serif;letter-spacing:.12em"></b><span style="opacity:.8"></span>'; document.body.appendChild(fadeEl); }
    fadeEl.querySelector('b').textContent = title; fadeEl.querySelector('span').textContent = line;
    fadeEl.classList.toggle('show', !!on);
  }
  // down for the night: sit on the edge of the bed, lie back, lights out
  function sleepBeats(at = null) {
    return [...(at ? [{ walk: at, speed: 1.3, max: 4 }] : []), { t: 1.0, pose: 'sit' }, { t: 1.6, pose: 'sit', start: () => fade(true, 'SLEEPING', '') }];
  }
  // pouring from a can: tilted over the filler for a couple of seconds, glugging
  function pourBeats(at, t = 2.2) {
    const can = prop('jerrycan');
    return [{ walk: { x: at.x, z: at.z }, speed: 1.3, max: 4, face: at.face }, { t, start: (ctx) => hold(ctx, can), ik: (F, k, ctx, P) => {
      const tilt = Math.min(1, k * 4) * (k < 0.9 ? 1 : (1 - k) * 10);
      const c = F.chest.clone().addScaledVector(F.fw, 0.42).addScaledVector(F.up, -0.25 + tilt * 0.12);
      can.position.copy(c); can.rotation.set(-tilt * 1.2, Math.atan2(F.fw.x, F.fw.z), 0, 'YXZ'); can.updateMatrixWorld(true);
      P.reach(P.R, c.clone().addScaledVector(F.up, 0.17).addScaledVector(F.right, 0.03), F, 'R');
      P.reach(P.L, c.clone().addScaledVector(F.right, -0.1).addScaledVector(F.up, -0.08), F, 'L');
      if (Math.random() < 0.06) game.audio?.thud?.(0.04);
    } }, { t: 0.3, start: (ctx) => { ctx.held = null; can.parent?.remove(can); } }];
  }
  // cash changes hands: beats for your side (dir 'give': you pay them; 'take': they pay you)
  function toward(who, gap = 0.85, max = 3) {
    const dx = player.pos.x - who.pos.x, dz = player.pos.z - who.pos.z, L = Math.hypot(dx, dz) || 1;
    if (L <= gap + 0.15) return { face: who.pos, t: 0.3 };
    return { walk: { x: who.pos.x + (dx / L) * gap, z: who.pos.z + (dz / L) * gap }, face: who.pos, max };
  }
  function payBeats(who, dir = 'give', t = 1.1) {
    const cash = prop('cash');
    if (dir === 'take') who.hold(cash, false);
    return [{ face: who.pos, t: 0.35 }, ...handBeats(who, cash, dir, t), { t: 0.01, start: (ctx) => { if (ctx.held === cash) { scene.remove(cash); ctx.held = null; } if (who.held === cash) { who.drop(); scene.remove(cash); } } }];
  }

  // ---------- arms
  // a thing held out in front: both hands on its sides, or one hand under it
  function carry(P, F, mesh, two, out = 0.34, drop = 0.12, at = null) {
    const c = at || F.chest.clone().addScaledVector(F.fw, out).addScaledVector(F.up, -drop);
    mesh.position.copy(c); mesh.rotation.set(0, Math.atan2(F.fw.x, F.fw.z), 0); mesh.updateMatrixWorld(true);
    const half = two ? (new THREE.Box3().setFromObject(mesh).getSize(_w).x * 0.5 || 0.18) : 0;
    if (two) {
      P.reach(P.R, c.clone().addScaledVector(F.right, half + 0.02), F, 'R');
      P.reach(P.L, c.clone().addScaledVector(F.right, -half - 0.02), F, 'L');
    } else {
      P.reach(P.R, c.clone().addScaledVector(F.up, -0.03), F, 'R');
      P.attachToHand(mesh, P.R);
      mesh.rotateX(Math.PI / 2); mesh.updateMatrixWorld(true);
    }
    return c;
  }
  // a hand to a point (knock, press, take): pulse > 0 taps back and forth that many times over k 0..1
  function reachTo(P, F, side, target, k = 1, pulse = 0) {
    const arm = side === 'L' ? P.L : P.R;
    const sh = arm.upper.getWorldPosition(new THREE.Vector3());
    let t = target.clone();
    if (pulse) { const back = Math.abs(Math.sin(k * Math.PI * pulse)); t.addScaledVector(F.fw, -0.09 * back); }
    const rest = sh.clone().addScaledVector(F.up, -0.5).addScaledVector(F.fw, 0.12).addScaledVector(F.right, side === 'L' ? -0.08 : 0.08);
    const e = smooth(clamp(Math.min(k, 1 - k) * 5, 0, 1)); // out, hold, back
    P.reach(arm, rest.lerp(t, pulse ? 1 : e), F, side);
  }
  function handsUp(P, F, k = 1) {
    for (const s of ['R', 'L']) { const arm = P[s], sh = arm.upper.getWorldPosition(new THREE.Vector3()); P.reach(arm, sh.addScaledVector(F.up, 0.38 * k).addScaledVector(F.right, (s === 'R' ? 0.22 : -0.22)).addScaledVector(F.fw, 0.05), F, s); }
  }
  function handsBehind(P, F) {
    const back = F.chest.clone().addScaledVector(F.fw, -0.22).addScaledVector(F.up, -0.42);
    P.reach(P.R, back.clone().addScaledVector(F.right, 0.05), F, 'R'); P.reach(P.L, back.clone().addScaledVector(F.right, -0.05), F, 'L');
    return back;
  }
  function wristsOf(P) { return { R: P.R.wrist.getWorldPosition(new THREE.Vector3()), L: P.L.wrist.getWorldPosition(new THREE.Vector3()) }; }

  // ---------- the runner
  let cur = null;
  function play(beats, opts = {}) {
    if (S.doorWalk || S.entering || S.mode !== 'foot' || S.dead > 0) return null; // (no done: the caller falls back)
    const ctx = { held: null, heldTwo: false, data: opts.data || {} };
    let i = -1, b = null, t = 0, ended = false;
    const pp = player.pos;
    const begin = () => {
      i++; t = 0; b = beats[i] || null;
      if (!b) return;
      try { b.start?.(ctx); } catch (e) { console.error('[acts] ' + (e && e.message), e); }
      if (b.clip) player.h.play(b.clip, 0.15, b.speed || 1, true);
      if (b.pose === 'crouch' || b.pose === 'kneel') player.h.play('Crouch_Idle_Loop', 0.25, 1, true);
      else if (b.pose === 'sit') player.h.play('Sitting_Idle_Loop', 0.25, 1, true);
      else if (b.pose === 'idle') player.h.play('Idle_Loop', 0.25, 1, true);
      if (b.say) game.hud?.toast(`${b.say[0] ? b.say[0] + ': ' : ''}${b.say[1]}`, b.sayT || 3);
    };
    const lenOf = (bb) => bb.t ?? (bb.clip ? (player.h.clips?.[bb.clip]?.duration || 2) / (bb.speed || 1) : bb.wait ?? (bb.face || bb.yaw != null ? 0.35 : 0));
    const finish = (ok) => {
      if (ended) return; ended = true;
      if (S.doorWalk === A) S.doorWalk = null;
      if (cur === A) cur = null;
      if (ctx.held) { scene.remove(ctx.held); ctx.held = null; }
      player.h.locked = 0;
      opts.done?.(ok);
    };
    const A = {
      acting: true, t: 0, get beat() { return i; },
      update(dt) {
        A.t += dt;
        // somebody else moved you (a teleport, a respawn): the scene is over
        if (A.lastP && Math.hypot(pp.x - A.lastP.x, pp.z - A.lastP.z) > 2.5) { finish(false); return; }
        // advance through finished beats
        for (let guard = 0; b && guard < 8; guard++) {
          let doneBeat = false;
          if (b.walk) {
            const w = b.walk, dx = w.x - pp.x, dz = w.z - pp.z, L = Math.hypot(dx, dz);
            if (L > (b.near ?? 0.1) && t < (b.max ?? 6)) {
              player.heading += wrapA(Math.atan2(dx, dz) - player.heading) * Math.min(1, dt * 8);
              const sp = Math.min(b.speed || 1.35, L * 4);
              pp.x += (dx / L) * sp * dt; pp.z += (dz / L) * sp * dt;
              player.h.play((b.speed || 1.35) > 2.4 ? 'Jog_Fwd_Loop' : 'Walk_Loop', 0.15, clamp((b.speed || 1.35) / 1.35, 0.6, 1.3));
            } else {
              if (L > (b.near ?? 0.1)) { pp.x = w.x; pp.z = w.z; }
              if (b.face) { const want = Math.atan2(b.face.x - pp.x, b.face.z - pp.z), d = wrapA(want - player.heading); player.heading += d * Math.min(1, dt * 10); if (Math.abs(d) < 0.05 || t > (b.max ?? 6) + 0.6) doneBeat = true; else player.h.play('Idle_Loop', 0.2); }
              else doneBeat = true;
            }
            pp.y = surf(pp.x, pp.z, pp.y);
          } else {
            if (b.face) player.heading += wrapA(Math.atan2(b.face.x - pp.x, b.face.z - pp.z) - player.heading) * Math.min(1, dt * 10);
            else if (b.yaw != null) player.heading += wrapA(b.yaw - player.heading) * Math.min(1, dt * 10);
            if (t >= lenOf(b)) doneBeat = true;
          }
          if (b.each) { try { b.each(dt, clamp(t / Math.max(lenOf(b), 1e-3), 0, 1), ctx); } catch (e) { console.error('[acts] ' + (e && e.message), e); } }
          if (!doneBeat) break;
          try { b.end?.(ctx); } catch (e) { console.error('[acts] ' + (e && e.message), e); }
          begin();
        }
        t += dt;
        player.vel?.set(0, 0, 0);
        player.h.update(dt); player.h.root.position.copy(pp); player.h.root.rotation.y = player.heading;
        const P = gp();
        if (P?.ok && (ctx.held || b?.ik)) {
          player.h.root.updateMatrixWorld(true);
          const F = P.frame(player.heading), k = b ? clamp(t / Math.max(lenOf(b), 1e-3), 0, 1) : 1;
          if (b?.ik) { try { b.ik(F, k, ctx, P); } catch (e) { console.error('[acts] ' + (e && e.message), e); } }
          else if (ctx.held) carry(P, F, ctx.held, ctx.heldTwo);
        }
        A.lastP = { x: pp.x, z: pp.z };
        if (!b) finish(true);
      },
      cancel() { finish(false); },
    };
    cur = A;
    S.doorWalk = A; // (main.js runs it in place of the on-foot controls and cancels it if you get hurt badly or into a car)
    begin();
    return A;
  }
  const hold = (ctx, mesh) => { if (ctx.held && ctx.held !== mesh) scene.remove(ctx.held); ctx.held = mesh; ctx.heldTwo = !!mesh && TWO_HANDS.has(mesh.userData.kind); if (mesh && !mesh.parent) scene.add(mesh); };

  // ---------- hand something from one person to the other: both reach, it passes between them.
  // Beats for your side; `who` is a person(). dir 'give' (you to them) or 'take' (them to you).
  function handBeats(who, mesh, dir = 'give', t = 1.2) {
    const two = TWO_HANDS.has(mesh.userData.kind);
    const chestOf = (F) => F.chest.clone().addScaledVector(F.fw, 0.3).addScaledVector(F.up, -0.12);
    return [{ t, start: (ctx) => { if (dir === 'give') hold(ctx, mesh); else who.hold(mesh, two); },
      each: (dt) => { who.face(player.pos, dt); who.sync(dt); },
      ik: (F, k, ctx, P) => {
        const WF = who.pose?.ok ? who.pose.frame(who.heading) : null;
        const mine = chestOf(F), theirs = WF ? chestOf(WF) : who.pos.clone().add(_v.set(0, 1.15, 0));
        const mid = mine.clone().lerp(theirs, 0.5);
        // the item: from the giver's chest out to the middle (k 0..0.5), then in to the taker (0.5..1)
        const giverPt = dir === 'give' ? mine : theirs, takerPt = dir === 'give' ? theirs : mine;
        const at = k < 0.5 ? giverPt.clone().lerp(mid, smooth(k * 2)) : mid.clone().lerp(takerPt, smooth((k - 0.5) * 2));
        if (dir === 'give' && k >= 0.5 && ctx.held === mesh) { ctx.held = null; who.hold(mesh, two); }
        if (dir === 'take' && k >= 0.5 && who.held === mesh) { who.drop(); hold(ctx, mesh); }
        // whoever has it carries it at `at`; the other's hands come to meet it and go back
        const reachK = k < 0.5 ? 0.15 + k * 0.7 : 0.5 + (k - 0.5) * 0.9; // (reachTo: out, hold, back)
        if (ctx.held === mesh) carry(P, F, mesh, two, 0.3, 0.12, at);
        else { reachTo(P, F, 'R', at, reachK); if (two) reachTo(P, F, 'L', at, reachK); }
        if (WF) {
          if (who.held === mesh) { who.ik = null; carry(who.pose, WF, mesh, two, 0.3, 0.12, at); }
          else { reachTo(who.pose, WF, 'R', at, reachK); if (two) reachTo(who.pose, WF, 'L', at, reachK); }
        }
      },
      end: () => { who.ik = null; } }];
  }

  // ---------- the doorstep: to the door, knock, they open up, take it from you (and maybe pay), shut
  //  spot: { x, z, nx, nz, door? } (the door's middle at the wall and its outside normal)
  //  opts: { name, line, thanks, pay (they hand you cash), nobody (leave it on the mat), leftLine, done(ok) }
  function doorstep(spot, item, opts = {}) {
    const front = { x: spot.x + spot.nx * 0.85, z: spot.z + spot.nz * 0.85 };
    const gy = surf(spot.x + spot.nx, spot.z + spot.nz, player.pos.y);
    const doorPt = new THREE.Vector3(spot.x + spot.nx * 0.06, gy + 1.3, spot.z + spot.nz * 0.06);
    const mesh = prop(item), two = TWO_HANDS.has(item), d = spot.door;
    const swing = (mode) => { if (d && game.estate?.swingDoor) game.estate.swingDoor(d, mode, null); };
    // who answers: there from the start, out of sight behind the door
    const who = opts.nobody ? null : person({ x: spot.x - spot.nx * 0.6, y: gy, z: spot.z - spot.nz * 0.6 }, Math.atan2(spot.nx, spot.nz), opts.who || null);
    if (who) who.h.root.visible = false;
    const waitIk = (F, k, ctx, P) => carry(P, F, mesh, two, 0.3);
    const beats = [
      { walk: front, speed: 1.4, face: { x: spot.x, z: spot.z }, max: 8, start: (ctx) => hold(ctx, mesh) },
      // knock with the right hand (the parcel on your left arm)
      { t: 1.3, start: () => { const k = () => (game.audio?.knock ? game.audio.knock() : game.audio?.thud?.(0.25)); k(); setTimeout(k, 360); setTimeout(k, 700); },
        ik: (F, k, ctx, P) => { const c = F.chest.clone().addScaledVector(F.fw, 0.24).addScaledVector(F.up, -0.18).addScaledVector(F.right, -0.1); mesh.position.copy(c); mesh.rotation.set(0, player.heading, 0); P.reach(P.L, c.clone().addScaledVector(F.right, -0.05), F, 'L'); reachTo(P, F, 'R', doorPt.clone().addScaledVector(F.right, 0.15), k, 3); } },
      { t: opts.nobody ? 1.6 : 1.2, ik: waitIk },
    ];
    if (opts.nobody) {
      beats.push({ pose: 'crouch', t: 1.0, ik: (F, k, ctx, P) => { const mat = new THREE.Vector3(spot.x + spot.nx * 0.45, gy + 0.08, spot.z + spot.nz * 0.45); carry(P, F, mesh, two, 0.3, 0.1, F.chest.clone().addScaledVector(F.fw, 0.3).lerp(mat, smooth(k))); },
        end: (ctx) => { ctx.held = null; const left = mesh; setTimeout(() => scene.remove(left), 20000); } });
      beats.push({ t: 0.5, pose: 'idle', say: opts.leftLine ? ['', opts.leftLine] : null });
      const r0 = play(beats, { done: (ok) => { if (!ok) scene.remove(mesh); opts.done?.(ok); } });
      if (!r0) scene.remove(mesh);
      return r0;
    }
    beats.push(
      { t: 0.8, start: () => { swing('open'); who.h.root.visible = true; }, each: (dt) => { who.walk({ x: spot.x + spot.nx * 0.2, z: spot.z + spot.nz * 0.2 }, dt, 1.0); who.sync(dt); }, ik: waitIk },
      { t: 1.0, say: [opts.name || '', opts.line || 'Oh, thank you!'], each: (dt) => { who.face(player.pos, dt); who.h.play('Idle_Talking_Loop', 0.2); who.sync(dt); }, ik: waitIk },
      ...handBeats(who, mesh, 'give', 1.2),
    );
    if (opts.pay) { const cash = prop('cash'); beats.push(...handBeats(who, cash, 'take', 1.0), { t: 0.01, start: (ctx) => { if (ctx.held === cash) { scene.remove(cash); ctx.held = null; } } }); }
    beats.push(
      { t: 0.9, say: opts.thanks ? ['', opts.thanks] : null, each: (dt) => { who.walk({ x: spot.x - spot.nx * 0.7, z: spot.z - spot.nz * 0.7 }, dt, 1.1); who.sync(dt); } },
      { t: 0.45, start: () => { swing('close'); who.remove(); } },
    );
    const r1 = play(beats, { done: (ok) => { if (!ok) who.remove(); scene.remove(mesh); opts.done?.(ok); } });
    if (!r1) { who.remove(); scene.remove(mesh); }
    return r1;
  }

  // ---------- at the counter: whenever you've bought something from a shopkeeper (a store screen or a
  // conversation closes and you've less money than when it opened), you pay them and they hand you a bag.
  // S.frozen is watched rather than game.pause, because some stores keep their own copy of game.pause.
  let frozen = !!S.frozen, money0 = null;
  Object.defineProperty(S, 'frozen', { configurable: true, enumerable: true, get: () => frozen,
    set: (b) => { b = !!b; if (b && !frozen && money0 == null) money0 = S.money; frozen = b; } });
  function counter(spent) {
    if (S.mode !== 'foot' || S.doorWalk || S.entering || S.dead > 0 || S.cutscene) return false;
    let best = null, bd = 4.2, payOnly = false;
    for (const k of [...(game.storeKeepers || []), ...(game.counterPeople || [])]) {
      const h = k.h; if (!h || k.taken || !h.root.parent || h.root.visible === false) continue;
      const d = h.root.getWorldPosition(_v).distanceTo(player.pos);
      if (d < bd && Math.abs(_v.y - player.pos.y) < 1.5) { bd = d; best = h; payOnly = !!k.payOnly; }
    }
    if (!best) return false;
    if (payOnly) { api.nextGoods = null; const who = fromHuman(best); return !!play(payBeats(who, 'give', 1.0), { done: () => who.release() }); }
    const ng = api.nextGoods; api.nextGoods = null;
    const who = fromHuman(best), goods = ng?.mesh || prop(spent >= 500 ? 'box' : 'bag');
    if (!goods.userData.kind) goods.userData.kind = 'food';
    const after = ng?.then ? ng.then(goods) : [{ t: 0.7, ik: (F, k, ctx, P) => ctx.held && carry(P, F, ctx.held, TWO_HANDS.has(goods.userData.kind)) }];
    return !!play([{ face: who.pos, t: 0.3 }, ...payBeats(who, 'give', 1.0), { t: 0.01, start: () => who.hold(goods, TWO_HANDS.has(goods.userData.kind)) }, ...handBeats(who, goods, 'take', 1.1), ...after],
      { done: () => { who.release(); goods.parent?.remove(goods); } });
  }

  // the phone: the game is paused (and not drawn) while its screen is open, so what you see is the end of
  // it: you finish with it in your hand, look at it a moment, and put it back in your pocket
  let phoneOut = null;
  const phoneAt = (F) => F.chest.clone().addScaledVector(F.fw, 0.3).addScaledVector(F.up, 0.1).addScaledVector(F.right, 0.03);
  function phoneUp() {
    if (S.mode !== 'foot' || S.doorWalk || S.dead > 0 || S.cutscene || phoneOut) return;
    phoneOut = prop('phone');
  }
  function phoneAway() {
    const ph = phoneOut; phoneOut = null;
    if (!ph || S.mode !== 'foot' || S.dead > 0) return;
    const run = play([{ t: 0.45, start: (ctx) => hold(ctx, ph), ik: (F, k, ctx, P) => { P.reach(P.R, phoneAt(F), F, 'R'); P.attachToHand(ph, P.R); } }, { t: 0.55, ik: (F, k, ctx, P) => {
      const pocket = F.chest.clone().addScaledVector(F.right, 0.2).addScaledVector(F.up, -0.45).addScaledVector(F.fw, 0.05);
      P.reach(P.R, phoneAt(F).lerp(pocket, smooth(k)), F, 'R'); P.attachToHand(ph, P.R);
    } }, { t: 0.01, start: (ctx) => { ctx.held = null; ph.parent?.remove(ph); } }]);
    if (!run) ph.parent?.remove(ph);
  }
  const api = { play, phoneUp, phoneAway, person, fromPed, fromHuman, toward, payBeats, eatBeats, treatBeats, pickupBeats, waveBeats, knifeBeats, workBeats, sleepBeats, pourBeats, fade, counter, prop, carry, reachTo, handsUp, handsBehind, wristsOf, handBeats, hold, doorstep, get acting() { return !!cur; }, cancel() { cur?.cancel(); } };
  game.acts = api;
  game.fade = (fn) => { fade(true); setTimeout(() => { try { fn?.(); } catch (e) { console.error('[acts] ' + (e && e.message), e); } setTimeout(() => fade(false), 300); }, 1250); }; // (style.css .sbfade takes 1.2 s to go black)
  return { update() {
    // the store screen (or the conversation) closed: settle up at the counter
    if (money0 != null && !frozen && !S.stepping) { const spent = money0 - S.money; money0 = null; if (spent > 0) counter(spent); api.nextGoods = null; }
    else if (money0 != null && !frozen) money0 = null;
    return '';
  } };
}
