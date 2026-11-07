// Further away, cheaper (O3). The frame's cost on a fast graphics card is mostly how many separate
// things are handed to it (draw calls: in a browser each one costs CPU time, however fast the card),
// not how many pixels it fills. A profile on High found 2,000-3,650 a frame; the biggest shares were
// cars (each one ~90 parts, down to the pedals and brake pads, every part casting a shadow at any
// distance), people's shadows, and camps and settlements built of 50-200 pieces drawn even 2 km away.
//
// So, by distance from the camera:
//  - cars: pedals, brake parts and the like go first, then wipers, discs, badges, then anything under
//    a metre across; the cabin's insides go once you can't see through the glass; shadows from the
//    small parts first, then from all of it (the soft patch underneath, G12, stays)
//  - people: cast shadows only fairly close (the animation is already thinned out far away, peds.js)
//  - camps, settlements and other props built of many pieces: small pieces go, then shadows, then
//    the whole thing past the view where it's a few pixels
// Lights, glows and lamps are never thinned out (a car's headlights at night are seen from afar).
//
// Parts are hidden from the camera with layer 0 rather than `.visible`, so nothing here fights the
// game's own showing and hiding (doors, glass, damage); hits and collisions don't use layers.
// The distances scale with the preset, and shrink further when the frame rate is short and the
// time is going on the CPU (setPressure), where turning the resolution down wouldn't help.
import * as THREE from 'three';

const PRESET = { Phone: 0.55, Low: 0.7, Medium: 0.85, High: 1, Ultra: 1.25, Cinematic: 1.6 };
const LIGHTISH = /light|lamp|glow|beam|flare|signal|indicator|emiss|neon|sign/i;

export function createDetailManager(scene, quality) {
  const base = PRESET[quality.label] || 1;
  let k = base; // current scale (pressure lowers it)
  const R = {};
  const setDistances = () => Object.assign(R, {
    personShadow: 45 * k,
    carTiny: 22 * k, carSmall: 55 * k, carMid: 140 * k, interior: 38 * k,
    carShadow: 55 * k, carShadowBody: 120 * k,
    propSmall: 120 * k, propShadow: 90 * k, propFar: 650 * k,
  });
  setDistances();

  const recs = new Map(); // root -> record
  let order = [], at = 0, rescanT = 0, frameN = 0;
  const cam = new THREE.Vector3(), ws = new THREE.Vector3();
  const stats = { roots: 0, people: 0, cars: 0, props: 0, partsHidden: 0, shadowsOff: 0, scale: k };

  function classify(root) {
    let skinned = false, meshes = 0;
    let car = !!root.userData.vehicle; // set by entities/vehicle.js (cars, boats, aircraft)
    root.traverse((o) => { if (o.isSkinnedMesh) skinned = true; else if (o.isMesh && !o.isInstancedMesh) meshes++; if (o.name === 'door-drv' || /^wheel/i.test(o.name)) car = true; });
    const kind = skinned ? 'person' : car ? 'car' : meshes >= 4 ? 'prop' : null;
    if (!kind) return { kind: null, n: meshes, t: 6 };
    root.updateWorldMatrix(true, true);
    const parts = [];
    root.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || !o.geometry) return;
      const g = o.geometry; if (!g.boundingSphere) g.computeBoundingSphere();
      o.getWorldScale(ws);
      const r = (g.boundingSphere?.radius || 0.5) * Math.max(ws.x, ws.y, ws.z);
      const m = Array.isArray(o.material) ? o.material[0] : o.material;
      const keep = LIGHTISH.test(o.name) || LIGHTISH.test(m?.name || '') || m?.blending === THREE.AdditiveBlending || (m?.emissiveIntensity > 0.5 && m?.emissive && (m.emissive.r + m.emissive.g + m.emissive.b) > 0.3);
      let wheel = false; for (let q = o; q && q !== root; q = q.parent) if (/wheel|tyre|tire/i.test(q.name)) { wheel = true; break; }
      parts.push({ o, r, cast: o.castShadow, keep, wheel, inside: /^interior/i.test(o.name), shown: true, casting: o.castShadow });
    });
    return { kind, parts, n: meshes, t: 6 + Math.random() * 2 };
  }
  // put a root back the way it was (before re-sorting its parts, or when it leaves the scene)
  function restore(rec) {
    if (!rec?.parts) return;
    for (const p of rec.parts) { if (!p.shown) p.o.layers.enable(0); if (p.casting !== p.cast) p.o.castShadow = p.cast; p.shown = true; p.casting = p.cast; }
  }

  function apply(root, rec) {
    const d = rec.kind === 'prop' ? 0 : root.position.distanceTo(cam);
    for (const p of rec.parts) {
      let show = true, cast = p.cast;
      if (rec.kind === 'person') cast = p.cast && d < R.personShadow;
      else if (rec.kind === 'car') {
        if (!p.keep) {
          if (p.inside && d > R.interior) show = false;
          else if (p.r < 0.2 && d > R.carTiny) show = false;
          else if (p.r < 0.45 && d > R.carSmall) show = false;
          else if (p.r < 0.9 && d > R.carMid && !p.wheel) show = false; // (tyres stay: a car with no wheels reads wrong even far off)
        }
        cast = p.cast && show && (d < R.carShadow ? true : d < R.carShadowBody && p.r > 1.1);
      } else {
        const e = p.o.matrixWorld.elements, dd = Math.hypot(e[12] - cam.x, e[13] - cam.y, e[14] - cam.z); // where it is now (props can be carried, towed, flown)
        if (!p.keep) show = dd < R.propFar && !(p.r < 0.5 && dd > R.propSmall);
        cast = p.cast && show && dd < R.propShadow;
      }
      if (show !== p.shown) { p.shown = show; if (show) p.o.layers.enable(0); else p.o.layers.disable(0); }
      if (cast !== p.casting) { p.casting = cast; p.o.castShadow = cast; }
    }
  }

  return {
    R, stats,
    // anything that must never be thinned out (the player)
    keep(root) { if (root) { root.userData.keepFull = true; const rec = recs.get(root); if (rec) { restore(rec); recs.delete(root); } } },
    // frame rate short and the CPU is the reason: draw less, nearer (1 = the preset's own distances)
    setPressure(f) {
      const nk = base * Math.max(0.45, Math.min(1, f));
      if (Math.abs(nk - k) < 0.01) return;
      k = nk; stats.scale = +k.toFixed(2); setDistances();
    },
    get pressure() { return k / base; },
    update(dt, camera) {
      cam.setFromMatrixPosition(camera.matrixWorld);
      const kids = scene.children;
      // which roots to look after: rechecked every 2 s
      if ((rescanT -= dt) <= 0) {
        rescanT = 2;
        order = [];
        for (const c of kids) if (!c.name && !c.userData.keepFull && (c.isGroup || c.type === 'Object3D') && c.children.length) order.push(c);
        for (const [root, rec] of recs) if (root.parent !== scene) { restore(rec); recs.delete(root); }
        let pe = 0, ca = 0, pr = 0; for (const rec of recs.values()) { if (rec.kind === 'person') pe++; else if (rec.kind === 'car') ca++; else if (rec.kind === 'prop') pr++; }
        Object.assign(stats, { roots: recs.size, people: pe, cars: ca, props: pr });
      }
      // a tenth of them a frame (each one looked at ~6 times a second at 60 fps)
      const per = Math.max(4, Math.ceil(order.length / 10));
      for (let j = 0; j < per && order.length; j++) {
        if (at >= order.length) at = 0;
        const root = order[at++];
        if (root.parent !== scene || root.userData.keepFull) continue;
        let rec = recs.get(root);
        if (rec && (rec.t -= dt * 10) <= 0) { // now and then: has it gained or lost parts (damage, a new hat)?
          let n = 0; root.traverse((o) => { if (o.isMesh && !o.isInstancedMesh && !o.isSkinnedMesh) n++; });
          if (n !== rec.n || (rec.kind === null && n >= 4)) { restore(rec); rec = null; } else rec.t = 6 + Math.random() * 2;
        }
        if (!rec) { rec = classify(root); recs.set(root, rec); }
        if (rec.kind && root.visible) apply(root, rec);
      }
      if (++frameN % 30 === 0) { let h = 0, s = 0; for (const rec of recs.values()) if (rec.parts) for (const p of rec.parts) { if (!p.shown) h++; if (p.cast && !p.casting) s++; } stats.partsHidden = h; stats.shadowsOff = s; }
    },
  };
}
