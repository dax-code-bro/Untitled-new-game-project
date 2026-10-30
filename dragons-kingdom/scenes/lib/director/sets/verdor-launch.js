// Shot director set piece - the LAUNCH AREA of the Verdor riding grounds (scene 1B): Charcoal at rest
// in his cleared launch space, his grounded access rig (architecture library accessRig: switchback
// stair, deck, drawbridge gangway) standing on two oak RUNNERS at his right flank, the line of STAKES
// that marks the edge of the launch space, and a ground keeper's clay pipe (a hand prop).
//
// Built by sets/verdor-grounds.js when a shot of the table casts `charcoal` (the 1A shots never do).
//
// MAP (VERDOR frame: +x EAST = the sea side, -z NORTH, the field at y ~9):
//   CHARCOAL_AT (44, -66)  his chest (thorax); he faces SOUTH, a little west (heading 190): his head
//                          toward the palace side, his RIGHT flank toward the west (Leaf's side of the
//                          field); the cameras that look north see him three-quarter front, screen
//                          RIGHT, with the morning sun (east, 31 deg up) raking along his back
//   the access rig         on his right flank at the withers: the gangway comes down onto his back
//                          beside the riding rig's seat when he crouches for mounting
//   the stakes             an arc on the west side, ~7 m beyond the rig's stair foot
//   LEAF_1B (14.4, -48.0)  Leaf for 1B: crouched beside his mounting platform (its +x side), facing
//                          EAST toward Charcoal, ~20 m from Remi at the rig (speaking range)
// Charcoal's two postures (DRAGONS.md low stance): 'rest' (the low stand, belly a third of the chest
// depth off the turf) until X3-02, where he lowers himself ('crouch', k 0 -> 1) and holds for the
// climb. The rig is placed for the crouch: its gangway's bolster lands on his back there.
// Rig states per shot (`set.rig`): 'up' (gangway raised: before he crouches), 'down' (lowered onto
// his back), 'back' (raised and drawn back on its runners, `set.rigSlide` metres, keys allowed).
import * as THREE from 'three';
import { Kit, yawFrame, frame, block, tube, sagLine, makeRand } from '../../architecture/core.js';
import { accessRig } from '../../architecture/verdor.js';
import { keyed } from '../timeline.js';

export const CHARCOAL_AT = [44, -66];
export const CHARCOAL_HEADING = 190;
export const LEAF_1B = [21.0, -50.0];
export const PLATFORM_1B = [21.0, -52.6, -90];     // his mounting platform brought alongside his LEFT flank (verdor-grounds set.platform [x, z, yaw deg])
export const REST_K = 0.5;                         // Charcoal at rest before he lowers himself: crouch k 0.5 (low and level)
const STAKES_X = 27;                               // the stakes: a line north - south, a gap where the rig is drawn back
const D2R = Math.PI / 180;
const GL = 8, DROP = 0.9, RAISED = -3.0;          // gangway length, its drop onto his back, raised (end up 3 m)
const RIG_S = 3.4;                                 // the tower's footprint (accessRig default size)
const ROPE_HAND = [3.0, 1.05, -8.5];                // where a guide rope reaches a keeper's hands (rig frame, x mirrored)

/** heading (deg, 0 = north / -z, 90 = east / +x) -> unit vector [x, z] */
const hv = (deg) => [Math.sin(deg * D2R), -Math.cos(deg * D2R)];

/**
 * Charcoal (a creature instance the stage adopts), his riding rig, the access rig in three states,
 * runners, stakes, the pipe. Returns { cast, objects, marks, ground(x, z, base), applyShot(info), point(name) }.
 */
export async function buildLaunch(ctx, { scene, H, G, M, creatures, quality }) {
  const { createCreature, createSaddle, poses } = creatures;
  const c = await createCreature('charcoal', { quality });
  scene.add(c.root);
  const tack = createSaddle(c, {});
  const [fx, fz] = hv(CHARCOAL_HEADING);
  const fwd = new THREE.Vector3(fx, 0, fz);
  const right = new THREE.Vector3(-fz, 0, fx);       // facing f, his right hand side (f x up)
  const yaw = Math.PI - CHARCOAL_HEADING * D2R;       // blocking.js yawFromHeading
  // pose him crouched (the mounting posture) where the stage will put him, to fit the rig to his back
  const C = new THREE.Vector3(CHARCOAL_AT[0], H(CHARCOAL_AT[0], CHARCOAL_AT[1]), CHARCOAL_AT[1]);
  c.setPose(poses.crouch(c, { t: 0, k: 1 }));
  c.root.position.copy(C);
  c.root.rotation.set(0, yaw, 0, 'YXZ');
  c.root.updateMatrixWorld(true);
  const seatW = () => {
    const bi = c.bones.indexOf(tack.seatBone);
    return tack.seatPoint.clone().applyMatrix4(c.skeleton.boneInverses[bi]).applyMatrix4(tack.seatBone.matrixWorld);
  };
  const seat0 = seatW();
  // the gangway's bolster rests on his back 1.3 m to the right of the seat, a little ahead of it; the
  // hide's height there by a ray down onto the posed body
  const landing = seat0.clone().addScaledVector(right, 1.3).addScaledVector(fwd, 0.6);
  let hideY = seat0.y - 0.6;
  {
    const body = c.meshes?.[0];
    if (body) {
      body.updateMatrixWorld(true);
      const ray = new THREE.Raycaster(landing.clone().setY(seat0.y + 6), new THREE.Vector3(0, -1, 0), 0, 20);
      const hit = ray.intersectObject(body, false)[0];
      if (hit) hideY = hit.point.y;
    }
  }
  // surface points for hands: on his body (wings included) by rays at setup, in the posture each is used in
  const bodyMeshes = [];
  c.root.traverse((o) => { if (o.isSkinnedMesh && o.geometry.attributes.position.count > 2000) bodyMeshes.push(o); });
  const hitOn = (from, dir) => { for (const m of bodyMeshes) m.updateMatrixWorld(true); const h = new THREE.Raycaster(from, dir.clone().normalize(), 0, 40).intersectObjects(bodyMeshes, false)[0]; return h ? h.point : null; };
  const surf = {};
  {
    // crouched: the top of his neck ahead of the seat (Remi's palm, X3-14), his right cheek (the eye close-up)
    const nk = hitOn(seat0.clone().addScaledVector(fwd, 1.05).addScaledVector(right, 0.3).setY(seat0.y + 8), new THREE.Vector3(0, -1, 0));
    if (nk) surf.neckPalm = nk.toArray();
    // resting (REST: a half crouch, low and level - the shots' 'rest'): his right flank at the girth,
    // 2.2 m up (Remi's hand on the strap, 1B-02), and the flank ahead of it (the 1B-01 insert)
    c.setPose(poses.crouch(c, { t: 0, k: REST_K }));
    c.root.updateMatrixWorld(true);
    const chest = new THREE.Vector3().setFromMatrixPosition(c.bones[c.boneIndex.thorax].matrixWorld);
    // (at the girth: the riding rig's band comes down his flank there, under the gangway)
    const gird = seat0.clone().setY(G + 2.2);
    const fl = hitOn(gird.clone().addScaledVector(right, 14), right.clone().negate());
    if (fl) { surf.flankStrap = fl.toArray(); surf.flankStand = fl.clone().addScaledVector(right, 0.62).setY(G).toArray(); }
    // the first ray that meets him: ahead of the chest at 3.4 m first (the shot's framing), then lower and
    // further back (a ray over a thin neck misses: 1B-01 failed with no mark at all)
    let fl2 = null;
    for (const [a, h] of [[4.5, 3.4], [3.0, 3.4], [4.5, 2.6], [1.5, 3.0], [0, 3.0], [-1.5, 2.6]]) {
      fl2 = hitOn(chest.clone().addScaledVector(fwd, a).addScaledVector(right, 14).setY(G + h), right.clone().negate());
      if (fl2) break;
    }
    if (fl2) surf.flankInsert = fl2.toArray();
    else if (fl) surf.flankInsert = fl.clone().setY(fl.y + 1).toArray();
    c.setPose(poses.crouch(c, { t: 0, k: 1 }));
    c.root.updateMatrixWorld(true);
  }
  const gz = right.clone().negate();                   // the gangway reaches from the deck toward him
  const gyaw = Math.atan2(gz.x, gz.z);
  const deckD = RIG_S * (1 - 0.035) + 0.6;
  const reach = deckD / 2 + Math.sqrt(GL * GL - DROP * DROP) + 0.1;
  const rigO = landing.clone().addScaledVector(gz, -reach);
  const rigGround = H(rigO.x, rigO.z) - 0.05;
  const rigH = hideY + 0.17 + 0.02 - 0.1 + DROP - rigGround;
  const F0 = yawFrame([0, 0, 0], gyaw);
  // the rig's local frame -> world (x, z) and back
  const lx = new THREE.Vector3(Math.cos(gyaw), 0, -Math.sin(gyaw)), lz = gz.clone();
  const toW = (x, z, o = rigO) => [o.x + lx.x * x + lz.x * z, o.z + lx.z * x + lz.z * z];
  const toL = (wx, wz, o = rigO) => { const dx = wx - o.x, dz = wz - o.z; return [dx * lx.x + dz * lx.z, dx * lz.x + dz * lz.z]; };

  const rigGroup = (drop, name) => {
    const k = new Kit(0);
    const info = accessRig(k, F0, { H: rigH, gangway: GL, gangwayDrop: drop, lod: 'mid' });
    // the runners: two squared oak skids under the sole plates, along the gangway axis (the rig is
    // drawn back on them, away from the dragon, before he launches)
    const rnd = makeRand(77), rk = new Kit(0);
    for (const sx of [-1, 1]) block(rk.get('oakDark'), frame([sx * RIG_S / 2, 0.06, 0.3], [0, 0, 1], [0, 1, 0]), RIG_S + 4.6, 0.2, 0.28, { r: 0.02, seg: [0.6, 0.1, 0.14], seed: rnd(), noise: 0.004, nf: 3, chip: 0.01, axis: [1, 0, 0] });
    // two guide ropes from the deck rail's rear corners down to the keepers' hands, the tails trailing
    // to coils on the turf (the keepers hold them in X3-01)
    const D = RIG_S * (1 - 0.035) + 0.6;
    for (const sx of [-1, 1]) {
      const a = [sx * D / 2, rigH + 1.1, -D / 2], h = [sx * ROPE_HAND[0], ROPE_HAND[1], ROPE_HAND[2]], g0 = [sx * (ROPE_HAND[0] + 0.3), 0.03, ROPE_HAND[2] - 1.1];
      tube(rk.get('rope'), sagLine(a, h, 0.18, 24), 0.013, { sides: 6 });
      tube(rk.get('rope'), sagLine(h, g0, -0.25, 8), 0.013, { sides: 6 });
      const coil = [];
      for (let i = 0; i <= 60; i++) { const an = i * 0.45, rr = 0.2 + 0.04 * Math.sin(i * 0.4) + 0.002 * i; coil.push([g0[0] + Math.cos(an) * rr, 0.02 + 0.02 * Math.floor(i / 14), g0[2] - 0.25 + Math.sin(an) * rr]); }
      tube(rk.get('rope'), coil, 0.013, { sides: 5 });
    }
    k.merge(rk, F0);
    const g = k.build(M, { name, origin: [0, 0, 0] });
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    const holder = new THREE.Group();
    holder.name = name;
    holder.add(g);
    holder.position.set(rigO.x, rigGround, rigO.z);
    scene.add(holder);
    return { holder, info };
  };
  const rigDown = rigGroup(DROP, 'access-rig-down');
  const rigUp = rigGroup(RAISED, 'access-rig-up');
  const RI = rigDown.info;
  // the stair geometry (accessRig): three flights round the tower to the deck
  const e = RIG_S / 2 + 0.7, y1 = rigH / 3, y2 = (2 * rigH) / 3, gwS = 1.05;
  const flights = [
    { p0: [-e, 0, RIG_S / 2 + 3.4], p1: [-e, y1, -e + 0.6], ax: 'z' },
    { p0: [-e + 0.6, y1, -e], p1: [e - 0.6, y2, -e], ax: 'x' },
    { p0: [e, y2, -e + 0.6], p1: [e, rigH, deckD / 2 - 0.1], ax: 'x2' },
  ];
  const nSteps = (rise) => Math.max(3, Math.round(rise / 0.21));
  const gang = Math.asin(Math.min(0.6, DROP / GL));
  const gEndZ = deckD / 2 + Math.cos(gang) * GL;
  // the walking surface of the rig in its local frame (null: not on the rig); `withGangway` when lowered
  const rigSurface = (x, z, withGangway) => {
    // deck
    if (Math.abs(x) <= deckD / 2 && Math.abs(z) <= deckD / 2) return rigH + 0.075;
    // landings
    if (Math.abs(x + e) <= 0.65 && Math.abs(z + e) <= 0.65) return y1 + 0.045;
    if (Math.abs(x - e) <= 0.65 && Math.abs(z + e) <= 0.65) return y2 + 0.045;
    for (const f of flights) {
      const { p0, p1 } = f;
      const along = f.ax === 'x' ? x : z, across = f.ax === 'x' ? z - p0[2] : x - p0[0];
      const a0 = f.ax === 'x' ? p0[0] : p0[2], a1 = f.ax === 'x' ? p1[0] : p1[2];
      if (Math.abs(across) > gwS / 2) continue;
      const u = (along - a0) / (a1 - a0);
      if (u < 0 || u > 1) continue;
      const rise = p1[1] - p0[1], n = nSteps(rise);
      return p0[1] + rise * Math.min(n, Math.floor(u * n) + 1) / n + 0.0;
    }
    if (withGangway && Math.abs(x) <= 0.55 && z >= deckD / 2 && z <= gEndZ) {
      const u = (z - deckD / 2) / (gEndZ - deckD / 2);
      return rigH + 0.05 + (rigH + 0.1 - DROP - rigH - 0.05) * u + 0.135 + 0.02;
    }
    return null;
  };

  const footL = [-e, RIG_S / 2 + 3.4 + 0.6];          // the stair's foot (rig frame)
  // the stakes: a line north - south on the west side of the launch space (Leaf's side of the field),
  // bowed a little toward him, a gap where the rig is drawn back through it; a rope from stake to stake
  const stakes = new Kit(0);
  const srnd = makeRand(91);
  const runs = [[], []];
  const gap = [rigO.z - 5.2, rigO.z + 4.6];            // the rig's runners pass here (z)
  for (let z = -33; z >= -97; z -= 2.6) {
    if (z < gap[1] && z > gap[0]) continue;
    const x = STAKES_X - 1.6 * Math.cos(((z + 65) / 32) * Math.PI / 2) + srnd.sym(0.15);
    const h = 1.05 + srnd.sym(0.08), lean = [srnd.sym(0.04), 1, srnd.sym(0.04)];
    const y = H(x, z) - 0.25;
    block(stakes.get('oakSilver'), frame([x, y + (h + 0.25) / 2, z], [1, 0, 0], lean), 0.075, h + 0.25, 0.075, { r: 0.012, seg: [0.08, 0.3, 0.08], seed: srnd(), noise: 0.003, nf: 5, chip: 0.008, axis: [0, 1, 0] });
    runs[z > gap[0] ? 0 : 1].push([x + lean[0] * h, y + h + 0.17, z + lean[2] * h]);
  }
  for (const r of runs) for (let i = 0; i + 1 < r.length; i++) tube(stakes.get('rope'), sagLine(r[i], r[i + 1], 0.12, 10), 0.009, { sides: 5 });
  const stakesG = stakes.build(M, { name: 'launch-stakes' });
  stakesG.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  scene.add(stakesG);

  // the ground keeper's short white-clay pipe (a hand prop: the stage places it in his palm)
  const pipe = new THREE.Group();
  {
    const clay = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.62, 0.58, 0.52), roughness: 0.55 });
    const char = new THREE.MeshStandardMaterial({ color: new THREE.Color(0.05, 0.04, 0.035), roughness: 0.9 });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.0045, 0.0055, 0.13, 8), clay);
    stem.rotation.z = Math.PI / 2; stem.position.set(0.02, 0, 0);
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.007, 0.035, 10, 1, true), clay);
    bowl.position.set(-0.05, 0.016, 0);
    const ash = new THREE.Mesh(new THREE.CircleGeometry(0.0095, 10), char);
    ash.rotation.x = -Math.PI / 2; ash.position.set(-0.05, 0.03, 0);
    pipe.add(stem, bowl, ash);
    pipe.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    pipe.visible = false;
    scene.add(pipe);
  }

  // marks (world): the rig's stair, landings, deck, gangway end; the stakes; Leaf's 1B place
  const W3 = (lxz, y) => { const [x, z] = toW(lxz[0], lxz[1]); return [x, rigGround + y, z]; };
  const marks = {
    charcoal: [C.x, C.y, C.z],
    rigFoot: W3(footL, 0), rigF1Top: W3([-e, -e + 0.75], y1), rigLand1: W3([-e, -e], y1), rigF2Top: W3([e - 0.75, -e], y2),
    rigLand2: W3([e, -e], y2), rigF3Top: W3([e, deckD / 2 - 0.35], rigH), rigDeck: W3([0, 0], rigH), rigDeckEdge: W3([0, deckD / 2 - 0.2], rigH),
    rigGangMid: W3([0, deckD / 2 + 4], rigH - 0.4), rigGangEnd: W3([0, gEndZ - 0.6], rigH - DROP + 0.2), rigTower: W3([0, 0], 0), rigBase: [rigO.x, rigGround, rigO.z],
    // the climb (rig frame -> world): stair foot, up flight 1 (west), landing 1, flight 2 (north), landing 2,
    // flight 3 (east), the deck, the gangway to his back
    climb1: W3([-e, -e + 0.75], y1), climb2: W3([-e, -e], y1), climb3: W3([-e + 0.65, -e], y1), climb4: W3([e - 0.65, -e], y2),
    climb5: W3([e, -e], y2), climb6: W3([e, -e + 0.65], y2), climb7: W3([e, deckD / 2 - 0.25], rigH), climb8: W3([0.9, deckD / 2 - 0.3], rigH),
    climb9: W3([0, deckD / 2], rigH), climb10: W3([0, deckD / 2 + 3.5], rigH), climb11: W3([0, gEndZ - 0.75], rigH - DROP + 0.1),
    deckWest: W3([0, -deckD / 2 + 0.45], rigH), deckNE: W3([0.9, 0.9], rigH),
    ropeHandL: W3([-ROPE_HAND[0], ROPE_HAND[2]], ROPE_HAND[1]), ropeHandR: W3([ROPE_HAND[0], ROPE_HAND[2]], ROPE_HAND[1]),
    ropeKeeperL: W3([-ROPE_HAND[0] - 0.1, ROPE_HAND[2] - 0.55], 0), ropeKeeperR: W3([ROPE_HAND[0] + 0.1, ROPE_HAND[2] - 0.55], 0),
    sideL: W3([-(RIG_S / 2 + 0.75), -0.3], 0), sideR: W3([RIG_S / 2 + 0.75, -0.3], 0),
    seat: seat0.toArray(), leaf1B: [LEAF_1B[0], G, LEAF_1B[1]], stakes: [STAKES_X, G, -50], ...surf,
  };
  console.warn(`[launch] charcoal ${C.toArray().map((v) => v.toFixed(2))} seat ${seat0.toArray().map((v) => v.toFixed(2))} hideY ${hideY.toFixed(2)} rigO ${rigO.x.toFixed(2)},${rigO.z.toFixed(2)} ground ${rigGround.toFixed(2)} rigH ${rigH.toFixed(2)} gyaw ${(gyaw / D2R).toFixed(1)}`);
  console.warn(`[launch] marks ${JSON.stringify(Object.fromEntries(Object.entries(marks).map(([k, v]) => [k, v.map((x) => +x.toFixed(2))])))}`);

  let state = 'up', slide = 0;
  const slideDir = right.clone();                       // drawn back away from the dragon
  return {
    cast: { charcoal: { kind: 'creature', id: 'charcoal', instance: c, tackInstance: tack, approxOffset: { head: [0, 0, 0] } } },
    objects: { pipe, rigDown: rigDown.holder, rigUp: rigUp.holder, stakes: stakesG },
    marks,
    /** the walking surface: the rig (stair, landings, deck, the lowered gangway) over the terrain */
    ground(x, z, base) {
      const o = state === 'back' ? rigO.clone().addScaledVector(slideDir, slide) : rigO;
      const [u, v] = toL(x, z, o);
      if (Math.abs(u) > 12 || Math.abs(v) > 16) return base;
      const s = rigSurface(u, v, state === 'down');
      return s == null ? base : Math.max(base, rigGround + s);
    },
    applyShot(info) {
      const st = info.spec.set || {};
      state = st.rig || 'up';
      slide = state === 'back' ? (st.rigSlide == null ? 5 : typeof st.rigSlide === 'number' ? st.rigSlide : keyed(info.local, st.rigSlide)) : 0;
      rigDown.holder.visible = state === 'down';
      rigUp.holder.visible = state !== 'down';
      rigUp.holder.position.set(rigO.x, rigGround, rigO.z).addScaledVector(slideDir, slide);
      rigUp.holder.updateMatrixWorld(true);
    },
    /** named points of the launch area that move with Charcoal's pose (after the creatures are posed) */
    point(name) {
      if (name === 'charcoalSeat') return seatW();
      // the rig's corner posts at hand height, wherever the rig has been drawn to (X3-16)
      const post = { rigPostL: [-(RIG_S / 2 + 0.05), 1.15, -0.3], rigPostR: [RIG_S / 2 + 0.05, 1.15, -0.3] }[name];
      if (post) {
        const o = rigO.clone().addScaledVector(slideDir, slide);
        const [x, z] = toW(post[0], post[2], o);
        return new THREE.Vector3(x, rigGround + post[1], z);
      }
      return null;
    },
    dynamic() { return state === 'back' ? [rigUp.holder] : []; },
    rig: { rigO, rigGround, rigH, gyaw, toW, toL },
  };
}
