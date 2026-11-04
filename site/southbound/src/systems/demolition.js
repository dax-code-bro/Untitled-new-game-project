// Houses that burn, and come back.
//
// Blow a house up and it catches fire: the shell chars and the flames climb out
// of it. Whoever was home runs out and watches from the far kerb. Someone calls
// it in, and an engine comes down the road with its siren going; the crew get
// down, run hoses and knock the fire down. When the smoke turns to steam they
// pack up and drive off, and the family (if you didn't kill them) loads up a
// van and moves out. The lot sits burnt-out until a builder takes it on, then
// it goes back up the way houses do, over a day and a half of game time:
// debris cleared into a dumpster behind a site fence, a slab poured, studs and
// plates stood up wall by wall, roof trusses set, OSB sheathing hung, roofing
// laid course by course from the eaves, siding run from the bottom up, and the
// house is back. Builders work days; at night the site sits quiet.
// The ruins and the rebuild are saved with the game.
import * as THREE from 'three';
import { Human } from '../entities/human.js';
import { makeFlame, makeSmoke, faceCamera } from '../world/fx.js';
import { nearestRoad } from './world-util.js';
import { dressMember, placeAccessories } from './gang.js';
import { wrapAngle } from '../util.js';

const STAGES = [['clear', 3], ['slab', 4], ['frame', 8], ['sheath', 4], ['roof', 4], ['siding', 7]]; // game hours each
const TOTAL = STAGES.reduce((a, s) => a + s[1], 0);
const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);

export function installDemolition(game) {
  const { scene, combat, career, hud, collision, lib, sky, camera, player, S } = game;
  const city = game.city, B = city.buildings;
  const P = career.p;
  P.ruins = P.ruins || {};
  const sites = new Map();
  const saved = new Map(), savedRoof = new Map(), savedGutter = new Map();
  const abs = () => sky.day * 24 + sky.hour;
  const me = () => (S.mode === 'car' && S.vehicle ? S.vehicle.pos : player.pos); // on foot or at the wheel
  const near = (p, r) => me().distanceTo(p) < r;
  const VC = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, metalness: 0 });
  // one fire light for the whole game, moved to whichever house is burning (adding and
  // removing lights at run time would recompile every shader in the scene)
  const fireLight = new THREE.PointLight(0xff7a2a, 0, 40, 1.6);
  fireLight.position.set(0, -1000, 0); scene.add(fireLight);

  // ---- taking a house off the map and putting it back
  function showHouse(bi, on) {
    const M = city.mesh;
    if (M) {
      if (!saved.has(bi)) { const m = new THREE.Matrix4(); M.getMatrixAt(bi, m); saved.set(bi, m); }
      M.setMatrixAt(bi, on ? saved.get(bi) : ZERO); M.instanceMatrix.needsUpdate = true;
    }
    const ri = city.roofOf?.get(bi);
    if (ri !== undefined && city.roofMesh) showRoof(bi, on);
    const gr = city.gutterRanges?.get(bi), gm = city.gutterMesh;
    if (gr && gm) {
      const pos = gm.geometry.attributes.position, [a, n] = gr;
      if (!savedGutter.has(bi)) savedGutter.set(bi, pos.array.slice(a * 3, (a + n) * 3));
      if (on) pos.array.set(savedGutter.get(bi), a * 3); else for (let k = a * 3; k < (a + n) * 3; k += 3) { pos.array[k] = 0; pos.array[k + 1] = -500; pos.array[k + 2] = 0; }
      pos.clearUpdateRanges?.(); pos.addUpdateRange?.(a * 3, n * 3); pos.needsUpdate = true;
    }
  }
  function showRoof(bi, on) {
    const ri = city.roofOf?.get(bi), RM = city.roofMesh;
    if (ri === undefined || !RM) return;
    if (!savedRoof.has(bi)) { const m = new THREE.Matrix4(); RM.getMatrixAt(ri, m); savedRoof.set(bi, m); }
    RM.setMatrixAt(ri, on ? savedRoof.get(bi) : ZERO); RM.instanceMatrix.needsUpdate = true;
  }

  // ---- geometry helpers (vertex-coloured, merged per site)
  const parts = [];
  const add = (g, col) => {
    g = g.index ? g.toNonIndexed() : g;
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col[0]; c[i * 3 + 1] = col[1]; c[i * 3 + 2] = col[2]; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3)); if (g.attributes.uv) g.deleteAttribute('uv');
    parts.push(g);
  };
  const boxG = (w, h, d, x, y, z, ry = 0, rx = 0, rz = 0) => { const g = new THREE.BoxGeometry(w, h, d); if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); return g.translate(x, y, z); };
  const flush = (mat = VC) => { if (!parts.length) return null; const g = mergeAll(parts.splice(0)); const m = new THREE.Mesh(g, mat); m.castShadow = m.receiveShadow = true; m.userData.noHit = true; return m; };
  function mergeAll(list) {
    let n = 0; for (const g of list) n += g.attributes.position.count;
    const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
    let o = 0;
    for (const g of list) { pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.computeBoundingSphere();
    return g;
  }
  const rnd = (seed) => { let s = seed >>> 0 || 1; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); };

  // the burnt-out shell: wall stubs at ragged heights, fallen rafters, ash and rubble
  function buildShell(b, seed) {
    const r = rnd(seed), g = new THREE.Group();
    const char = () => { const k = 0.025 + r() * 0.04; return [k, k * 0.9, k * 0.8]; };
    for (const [L, x0, z0, dx, dz] of [[b.w, b.x - b.w / 2, b.z - b.d / 2, 1, 0], [b.w, b.x - b.w / 2, b.z + b.d / 2, 1, 0], [b.d, b.x - b.w / 2, b.z - b.d / 2, 0, 1], [b.d, b.x + b.w / 2, b.z - b.d / 2, 0, 1]]) {
      for (let s = 0; s < L; s += 0.9) {
        if (r() < 0.22) continue; // burnt through
        const h = Math.min(b.h, 0.6 + r() * b.h * 0.9), seg = Math.min(0.9, L - s);
        add(boxG(dx ? seg : 0.14, h, dz ? seg : 0.14, x0 + dx * (s + seg / 2), b.y + h / 2, z0 + dz * (s + seg / 2)), char());
      }
    }
    add(boxG(b.w, 0.06, b.d, b.x, b.y + 0.03, b.z), [0.05, 0.048, 0.045]); // ash floor
    for (let k = 0; k < 10; k++) { const len = 2 + r() * Math.max(b.w, b.d) * 0.6; add(boxG(0.14, 0.2, len, b.x + (r() - 0.5) * b.w * 0.7, b.y + 0.4 + r() * b.h * 0.5, b.z + (r() - 0.5) * b.d * 0.7, r() * Math.PI, 0.3 + r() * 0.6), char()); }
    for (let k = 0; k < 14; k++) { const s = 0.4 + r() * 1.1; add(boxG(s, s * 0.5, s * 0.8, b.x + (r() - 0.5) * b.w * 0.8, b.y + s * 0.25, b.z + (r() - 0.5) * b.d * 0.8, r() * 3), r() < 0.3 ? [0.22, 0.2, 0.18] : char()); }
    const m = flush(); g.add(m);
    return g;
  }

  // ---- construction: everything for one house, revealed in order as the work goes on
  function buildSite(site) {
    const b = site.b, g = new THREE.Group(), r = rnd(site.bi * 7 + 3);
    const roof = city.roofOf?.has(site.bi) ? city.roofs[city.roofOf.get(site.bi)] : null;
    const storeys = b.h > 5 ? 2 : 1, Hs = Math.min(2.9, (roof ? b.h : b.h - 0.3) / storeys);
    const fx = site.d ? site.d.nx : 0, fz = site.d ? site.d.nz : 1; // the street side
    // site fence, dumpster, toilet, lumber, sign
    const FW = b.w + 6, FD = b.d + 6;
    for (const [L, cx, cz, alongX] of [[FW, b.x, b.z - FD / 2, 1], [FW, b.x, b.z + FD / 2, 1], [FD, b.x - FW / 2, b.z, 0], [FD, b.x + FW / 2, b.z, 0]]) {
      const street = (alongX && Math.sign(cz - b.z) === fz && fz) || (!alongX && Math.sign(cx - b.x) === fx && fx);
      for (let s = -L / 2; s < L / 2 - 0.1; s += 2.4) {
        if (street && Math.abs(s + 1.2) < 2.6) continue; // the gate
        const px = alongX ? cx + s + 1.2 : cx, pz = alongX ? cz : cz + s + 1.2, y = collision.surface(px, pz, b.y + 2);
        add(boxG(alongX ? 2.3 : 0.03, 1.15, alongX ? 0.03 : 2.3, px, y + 0.6, pz), [0.9, 0.32, 0.05]);
        add(boxG(0.05, 1.3, 0.05, alongX ? px - 1.17 : px, y + 0.65, alongX ? pz : pz - 1.17), [0.25, 0.25, 0.26]);
      }
    }
    const curb = new THREE.Vector3(b.x + fx * (b.w / 2 + 4.2), 0, b.z + fz * (b.d / 2 + 4.2));
    const side = new THREE.Vector3(fz, 0, -fx); // along the street
    const at = (k, j, h = 0) => { const p = curb.clone().addScaledVector(side, k).addScaledVector(new THREE.Vector3(fx, 0, fz), j); p.y = collision.surface(p.x, p.z, b.y + 3) + h; return p; };
    { const p = at(b.w * 0.35 + 2, -1.2); add(boxG(1.7, 1.3, 3.6, p.x, p.y + 0.65, p.z, Math.atan2(side.x, side.z)), [0.12, 0.3, 0.16]); } // roll-off dumpster
    { const p = at(-(b.w * 0.35 + 2), -1.5); add(boxG(1.1, 2.2, 1.1, p.x, p.y + 1.1, p.z), [0.1, 0.25, 0.6]); add(boxG(1.2, 0.08, 1.2, p.x, p.y + 2.24, p.z), [0.85, 0.85, 0.85]); } // portable toilet
    { const p = at(-(b.w * 0.15), -2.6); for (let k = 0; k < 6; k++) add(boxG(3.6, 0.09, 0.09 * 8, p.x, p.y + 0.1 + k * 0.1, p.z, Math.atan2(side.x, side.z)), [0.72, 0.58, 0.38]); } // lumber stack
    site.misc = flush(); g.add(site.misc);
    // builder's sign
    {
      const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
      x.fillStyle = '#f2f0ea'; x.fillRect(0, 0, 512, 256); x.fillStyle = '#1d4f8f'; x.fillRect(0, 0, 512, 70);
      x.fillStyle = '#fff'; x.font = 'bold 38px Arial'; x.textAlign = 'center'; x.fillText('CALVERA HOME BUILDERS', 256, 48);
      x.fillStyle = '#222'; x.font = '26px Arial'; x.fillText('Rebuilding after fire damage', 256, 120); x.font = '22px Arial'; x.fillText(`Permit #${20410 + site.bi} · Licensed & insured`, 256, 165); x.fillText('Hard hats required beyond this point', 256, 205);
      const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
      const sg = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.9), new THREE.MeshStandardMaterial({ map: t, roughness: 0.7 }));
      const p = at(2.4, 0.4, 1.4); sg.position.copy(p); sg.rotation.y = Math.atan2(fx, fz); sg.userData.noHit = true; g.add(sg);
    }
    // slab with its form boards
    add(boxG(b.w + 0.3, 0.32, b.d + 0.3, b.x, b.y - 0.1, b.z), [0.55, 0.55, 0.53]);
    site.slab = flush(); g.add(site.slab);
    add(boxG(b.w + 0.5, 0.36, 0.05, b.x, b.y - 0.08, b.z - b.d / 2 - 0.2), [0.7, 0.55, 0.35]); add(boxG(b.w + 0.5, 0.36, 0.05, b.x, b.y - 0.08, b.z + b.d / 2 + 0.2), [0.7, 0.55, 0.35]);
    add(boxG(0.05, 0.36, b.d + 0.5, b.x - b.w / 2 - 0.2, b.y - 0.08, b.z), [0.7, 0.55, 0.35]); add(boxG(0.05, 0.36, b.d + 0.5, b.x + b.w / 2 + 0.2, b.y - 0.08, b.z), [0.7, 0.55, 0.35]);
    site.forms = flush(); g.add(site.forms);
    // studs, plates: wall by wall, storey by storey (instanced, revealed in order)
    const WALLS = [[b.w, b.x - b.w / 2, b.z - b.d / 2 + 0.05, 1, 0], [b.d, b.x + b.w / 2 - 0.05, b.z - b.d / 2, 0, 1], [b.w, b.x + b.w / 2, b.z + b.d / 2 - 0.05, -1, 0], [b.d, b.x - b.w / 2 + 0.05, b.z + b.d / 2, 0, -1]];
    const studs = [], plates = [], sheets = [], siding = [];
    for (let st = 0; st < storeys; st++) {
      const y0 = b.y + 0.06 + st * (Hs + 0.05);
      for (const [L, x0, z0, dx, dz] of WALLS) {
        const front = (dx === 0 && Math.sign(x0 - b.x) === fx && fx) || (dz === 0 && Math.sign(z0 - b.z) === fz && fz);
        for (let s = 0; s <= L + 0.01; s += 0.4064) {
          const u = Math.min(s, L - 0.02);
          const opening = st === 0 && front && Math.abs(u - L / 2) < 0.55; // the front door
          const win = Math.abs(((u / L) * 3) % 1 - 0.5) < 0.12 && u > 1 && u < L - 1; // window rough openings
          studs.push({ x: x0 + dx * u, z: z0 + dz * u, y: y0, h: opening ? 0 : win ? Hs * 0.3 : Hs, along: dx !== 0, header: opening || win ? (opening ? 2.1 : Hs * 0.8) : 0 });
        }
        for (const py of [y0 + 0.02, y0 + Hs - 0.02, y0 + Hs + 0.02]) plates.push({ x: x0 + dx * L / 2, z: z0 + dz * L / 2, y: py, L, along: dx !== 0 });
        for (let s = 0; s < L; s += 1.22) {
          const seg = Math.min(1.22, L - s);
          sheets.push({ x: x0 + dx * (s + seg / 2) + (dz ? -dz : 0) * 0 + (dx === 0 ? Math.sign(x0 - b.x) * 0.07 : 0), z: z0 + dz * (s + seg / 2) + (dz === 0 ? Math.sign(z0 - b.z) * 0.07 : 0), y: y0 + Hs / 2, w: seg - 0.01, h: Hs, along: dx !== 0 });
        }
      }
    }
    const rows = Math.ceil((storeys * (Hs + 0.05)) / 0.2);
    for (let k = 0; k < rows; k++) for (const [L, x0, z0, dx, dz] of WALLS) {
      siding.push({ x: x0 + dx * L / 2 + (dx === 0 ? Math.sign(x0 - b.x) * 0.1 : 0), z: z0 + dz * L / 2 + (dz === 0 ? Math.sign(z0 - b.z) * 0.1 : 0), y: b.y + 0.1 + k * 0.2 + 0.1, L: L + 0.2, along: dx !== 0 });
    }
    const wood = new THREE.MeshStandardMaterial({ color: 0xc9a46c, roughness: 0.85 });
    const inst = (geo, mat, list, fn) => { const im = new THREE.InstancedMesh(geo, mat, Math.max(1, list.length)); const m4 = new THREE.Matrix4(); list.forEach((it, i) => { fn(it, m4); im.setMatrixAt(i, m4); }); im.count = 0; im.frustumCulled = false; im.castShadow = im.receiveShadow = true; im.userData.noHit = true; g.add(im); return im; }; // revealed piece by piece: a bounding sphere taken while empty would cull them for good
    const q = new THREE.Quaternion(), Y = new THREE.Vector3(0, 1, 0), v = new THREE.Vector3(), sc = new THREE.Vector3();
    site.studs = inst(new THREE.BoxGeometry(1, 1, 1), wood, studs, (it, m) => { q.setFromAxisAngle(Y, it.along ? 0 : Math.PI / 2); const h = it.h || 0.001; m.compose(v.set(it.x, it.y + h / 2, it.z), q, sc.set(0.038, h, 0.089)); });
    site.headers = inst(new THREE.BoxGeometry(1, 1, 1), wood, studs.filter((s) => s.header), (it, m) => { q.setFromAxisAngle(Y, it.along ? 0 : Math.PI / 2); m.compose(v.set(it.x, it.y + it.header, it.z), q, sc.set(0.42, 0.18, 0.089)); });
    site.plates = inst(new THREE.BoxGeometry(1, 1, 1), wood, plates, (it, m) => { q.setFromAxisAngle(Y, it.along ? 0 : Math.PI / 2); m.compose(v.set(it.x, it.y, it.z), q, sc.set(it.L, 0.038, 0.089)); });
    const osb = new THREE.MeshStandardMaterial({ color: 0xb08a58, roughness: 0.9 });
    site.sheets = inst(new THREE.BoxGeometry(1, 1, 1), osb, sheets, (it, m) => { q.setFromAxisAngle(Y, it.along ? 0 : Math.PI / 2); m.compose(v.set(it.x, it.y, it.z), q, sc.set(it.w, it.h, 0.012)); });
    const sidingM = new THREE.MeshStandardMaterial({ color: b.color ?? 0xe8e2d0, roughness: 0.75 });
    site.siding = inst(new THREE.BoxGeometry(1, 1, 1), sidingM, siding, (it, m) => { q.setFromAxisAngle(Y, it.along ? 0 : Math.PI / 2); m.compose(v.set(it.x, it.y, it.z), q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -0.04)), sc.set(it.L, 0.205, 0.02)); });
    // roof: trusses along the ridge, then decking, then shingle courses from the eaves up
    const top = b.y + 0.06 + storeys * (Hs + 0.05);
    const ridgeX = roof ? Math.abs(Math.sin(roof.rot)) < 0.5 : b.w >= b.d;
    const span = ridgeX ? b.d + 0.6 : b.w + 0.6, run = ridgeX ? b.w : b.d, rh = roof ? roof.h : 1.2;
    site.top = top; site.ridgeX = ridgeX;
    {
      const slope = Math.atan2(rh, span / 2), raft = Math.hypot(rh, span / 2);
      add(boxG(0.038, 0.14, span, 0, 0.07, 0), [0.75, 0.6, 0.4]);
      for (const s of [-1, 1]) add(boxG(0.038, 0.14, raft, 0, rh / 2, s * span / 4, 0, s * slope), [0.75, 0.6, 0.4]);
      add(boxG(0.038, rh, 0.09, 0, rh / 2, 0), [0.75, 0.6, 0.4]);
      for (const s of [-1, 1]) add(boxG(0.038, 0.09, raft * 0.5, 0, rh * 0.35, s * span * 0.14, 0, -s * 0.6), [0.75, 0.6, 0.4]);
      const tg = mergeAll(parts.splice(0));
      const list = []; for (let s = -run / 2 + 0.05; s <= run / 2 - 0.05; s += 0.61) list.push(s);
      site.trusses = inst(tg, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }), list, (s, m) => { q.setFromAxisAngle(Y, ridgeX ? 0 : Math.PI / 2); m.compose(v.set(b.x + (ridgeX ? s : 0), top, b.z + (ridgeX ? 0 : s)), q, sc.set(1, 1, 1)); });
      // decking and shingle courses on both slopes
      const courses = [];
      for (const side of [-1, 1]) for (let k = 0; k < 14; k++) courses.push({ side, k });
      const deck = new THREE.MeshStandardMaterial({ color: 0xa8845a, roughness: 0.9 });
      site.decking = inst(new THREE.BoxGeometry(1, 1, 1), deck, [-1, 1], (sd, m) => {
        q.setFromAxisAngle(Y, ridgeX ? 0 : Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), sd * slope));
        const c = new THREE.Vector3(0, rh / 2 + 0.08, sd * span / 4).applyQuaternion(new THREE.Quaternion().setFromAxisAngle(Y, ridgeX ? 0 : Math.PI / 2));
        m.compose(v.set(b.x + c.x, top + c.y, b.z + c.z), q, sc.set(run + 0.4, 0.02, raft + 0.1));
      });
      const shingle = new THREE.MeshStandardMaterial({ color: roof ? roof.color : 0x3b3b3e, roughness: 0.95 });
      site.shingles = inst(new THREE.BoxGeometry(1, 1, 1), shingle, courses, (it, m) => {
        const f = (it.k + 0.5) / 14, ry = new THREE.Quaternion().setFromAxisAngle(Y, ridgeX ? 0 : Math.PI / 2);
        q.copy(ry).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), it.side * slope));
        const c = new THREE.Vector3(0, rh * f + 0.11, it.side * (span / 2) * (1 - f)).applyQuaternion(ry);
        m.compose(v.set(b.x + c.x, top + c.y, b.z + c.z), q, sc.set(run + 0.45, 0.03, raft / 14 + 0.04));
      });
    }
    scene.add(g);
    return g;
  }

  // reveal the work up to `k` (0..1 over the whole job)
  function showProgress(site, k) {
    let t = k * TOTAL, stage = 0;
    while (stage < STAGES.length - 1 && t > STAGES[stage][1]) { t -= STAGES[stage][1]; stage++; }
    const f = Math.min(1, t / STAGES[stage][1]);
    const name = STAGES[stage][0], idx = STAGES.findIndex((s) => s[0] === name);
    const past = (n) => STAGES.findIndex((s) => s[0] === n) < idx;
    const at = (n) => name === n;
    // clearing: the burnt shell comes down into the dumpster
    if (site.shell) { site.shell.visible = at('clear') ? f < 0.92 : !past('clear') && !at('clear'); if (at('clear')) site.shell.scale.y = Math.max(0.05, 1 - f); }
    site.slab.visible = past('clear');
    site.slab.scale.y = at('slab') ? Math.max(0.05, f) : 1; site.slab.position.y = at('slab') ? 0 : 0;
    site.forms.visible = at('slab') || (at('frame') && f < 0.2);
    const n = (im, frac) => { im.count = Math.floor(im.instanceMatrix.count * Math.max(0, Math.min(1, frac))); };
    n(site.studs, at('frame') ? f / 0.6 : past('frame') ? 1 : 0);
    n(site.headers, at('frame') ? (f - 0.1) / 0.5 : past('frame') ? 1 : 0);
    n(site.plates, at('frame') ? (f - 0.05) / 0.55 : past('frame') ? 1 : 0);
    n(site.trusses, at('frame') ? (f - 0.62) / 0.38 : past('frame') ? 1 : 0);
    n(site.sheets, at('sheath') ? f : past('sheath') ? 1 : 0);
    n(site.decking, at('roof') ? f * 5 : past('roof') ? 1 : 0);
    n(site.shingles, at('roof') ? (f - 0.15) / 0.85 : past('roof') ? 1 : 0);
    n(site.siding, at('siding') ? f / 0.9 : 0);
    site.stage = name;
  }

  // ---- people
  function hardHat(color) {
    const g = new THREE.Group(), m = new THREE.MeshStandardMaterial({ color, roughness: 0.45 });
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.125, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), m); dome.scale.set(1, 0.85, 1.1);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.012, 20), m); brim.scale.set(1, 1, 1.15);
    const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.24), m); ridge.position.y = 0.1;
    g.add(dome, brim, ridge); g.userData.at = [0, 0.1, -0.005];
    g.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.userData.noHit = true; } });
    return g;
  }
  const SK = ['olive', 'tan', 'brown', 'light', 'dark'];
  function worker(kind, k) {
    const base = lib.peopleIds.filter((id) => id.startsWith('mh_m'))[k % 3] || lib.peopleIds[0];
    const M = kind === 'fire'
      ? { id: 'ff' + k, base, skin: SK[k % 5], suit: [0.24, 0.2, 0.11], hair: 'black', h: 1, w: 1.08, acc: [] }
      : { id: 'cw' + k, base, skin: SK[(k + 2) % 5], suit: k % 2 ? [0.9, 0.42, 0.04] : [0.7, 0.78, 0.1], hair: 'brown', h: 1, w: 1.04, acc: [] };
    const h = dressMember(lib, M);
    const hat = hardHat(kind === 'fire' ? (k === 0 ? 0xeeeeee : 0x1a1a1a) : (k % 2 ? 0xf2f2f2 : 0xf2c200));
    h.acc.push(hat); h.root.add(hat);
    scene.add(h.root);
    return h;
  }
  const walkTo = (h, to, dt, sp = 1.4) => {
    const p = h.root.position, dx = to.x - p.x, dz = to.z - p.z, d = Math.hypot(dx, dz);
    if (d < 0.3) return true;
    h.root.rotation.y += wrapAngle(Math.atan2(dx, dz) - h.root.rotation.y) * Math.min(1, dt * 7);
    p.x += (dx / d) * Math.min(d, sp * dt); p.z += (dz / d) * Math.min(d, sp * dt);
    p.y = collision.surface(p.x, p.z, p.y + 1);
    h.play(sp > 2.4 ? 'Jog_Fwd_Loop' : 'Walk_Loop', 0.25);
    return false;
  };
  const face = (h, to) => { h.root.rotation.y = Math.atan2(to.x - h.root.position.x, to.z - h.root.position.z); };

  // ---- vehicles that drive along the street to the house and away again
  function roadAt(b) {
    const r = nearestRoad(game.graph, b.x, b.z);
    if (!r || !r.edge || !r.edge.acc) return null;
    const e = r.edge, P2 = e.pts;
    let best = 0, bd = Infinity;
    for (let i = 1; i < P2.length; i++) {
      const ax = P2[i - 1][0], az = P2[i - 1][1], dx = P2[i][0] - ax, dz = P2[i][1] - az, L2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((b.x - ax) * dx + (b.z - az) * dz) / L2));
      const d = (ax + dx * t - b.x) ** 2 + (az + dz * t - b.z) ** 2;
      if (d < bd) { bd = d; best = e.acc[i - 1] + Math.sqrt(L2) * t; }
    }
    return { e, s: best };
  }
  const _sp = {};
  function driveAlong(v, e, s, dir) {
    game.traffic.sampleEdge(e, s, _sp);
    v.pos.set(_sp.x, collision.surface(_sp.x, _sp.z, _sp.y + 2), _sp.z);
    v.heading = Math.atan2(_sp.tx * dir, _sp.tz * dir);
    v.sync?.(0.016);
  }

  // ---- a house goes up
  function destroy(bi, cause) {
    const b = B[bi];
    if (sites.has(bi) || b.ruined) return;
    const d = game.estate?.doors?.[bi] || null;
    b.ruined = 'fire';
    showHouse(bi, false);
    const site = { bi, b, d, phase: 'burn', fire: 1, t: 0, flames: [], smoke: [], crew: [], family: [], seed: bi * 13 + 5 };
    site.shell = buildShell(b, site.seed); scene.add(site.shell);
    // fire: flames out of the shell and over the top, black smoke above
    const r = rnd(site.seed);
    for (let k = 0; k < 9; k++) {
      const f = makeFlame(2 + r() * 3.5, r());
      f.position.set(b.x + (r() - 0.5) * b.w * 0.9, b.y + r() * b.h * 0.6, b.z + (r() - 0.5) * b.d * 0.9);
      f.userData.base = f.scale.x; scene.add(f); site.flames.push(f);
    }
    for (let k = 0; k < 3; k++) { const sm = makeSmoke(14 + r() * 10, r(), 0.06); sm.position.set(b.x + (r() - 0.5) * b.w * 0.5, b.y + b.h, b.z + (r() - 0.5) * b.d * 0.5); scene.add(sm); site.smoke.push(sm); }
    if (![...sites.values()].some((s2) => s2.light)) { site.light = fireLight; fireLight.position.set(b.x, b.y + b.h + 1, b.z); }
    // whoever was home gets out (or doesn't)
    const night = sky.hour < 7 || sky.hour > 19, home = Math.random() < (night ? 0.75 : 0.4);
    if (home) {
      const n = 2 + Math.floor(Math.random() * 3);
      const lost = cause === 'inside' ? n : Math.random() < 0.25 ? 1 : 0;
      site.lost = lost;
      const door = d ? new THREE.Vector3(d.x, b.y, d.z) : new THREE.Vector3(b.x, b.y, b.z + b.d / 2 + 1);
      const across = door.clone().add(new THREE.Vector3(d ? d.nx : 0, 0, d ? d.nz : 1).multiplyScalar(13));
      for (let k = 0; k < n - lost; k++) {
        const h = new Human(lib, lib.peopleIds[(bi + k) % lib.peopleIds.length]);
        h.root.position.copy(door); scene.add(h.root);
        site.family.push({ h, to: across.clone().add(new THREE.Vector3((k - 1) * 1.2, 0, (k % 2) * 0.8)), at: false });
      }
      if (near(door, 120)) hud.toast(lost ? `The house is burning. ${lost === n ? 'Nobody got out.' : 'Not everyone got out.'}` : 'The family got out. Someone is calling 911.', 3.5);
      if (lost) game.police?.crime?.('kill');
    }
    game.onShotFired?.(new THREE.Vector3(b.x, b.y, b.z));
    site.callIn = 6 + Math.random() * 8; // seconds until the engine is rolling
    sites.set(bi, site);
    P.ruins[bi] = { phase: 'ruin', t0: abs() };
    career.saveSoon?.();
  }

  function dispatchEngine(site) {
    const R = roadAt(site.b);
    const truck = new game.Vehicle(lib, 'firetruck');
    truck.siren = true;
    scene.add(truck.group);
    const crew = [0, 1, 2].map((k) => worker('fire', k));
    for (const h of crew) h.root.visible = false;
    if (R) {
      const dir = R.s > 110 || R.s + 110 > R.e.len ? (R.s > 110 ? 1 : -1) : 1;
      site.engine = { v: truck, R, dir, s: Math.max(0, Math.min(R.e.len, R.s - dir * 110)), stop: R.s + dir * 4, phase: 'in', t: 0 };
      driveAlong(truck, R.e, site.engine.s, dir);
    } else {
      const p = new THREE.Vector3(site.b.x + (site.d?.nx || 0) * (site.b.w / 2 + 7), 0, site.b.z + (site.d?.nz || 1) * (site.b.d / 2 + 7));
      truck.pos.set(p.x, collision.surface(p.x, p.z, site.b.y + 3), p.z); truck.sync?.(0);
      site.engine = { v: truck, R: null, phase: 'arrived', t: 0 };
    }
    site.crew = crew.map((h, k) => ({ h, k, spot: null, hose: null }));
    if (near(new THREE.Vector3(site.b.x, site.b.y, site.b.z), 200)) hud.toast('Fire engine on the way', 2);
  }

  const hoseMat = new THREE.MeshBasicMaterial({ color: 0xdfeefa, transparent: true, opacity: 0.45, depthWrite: false });
  const hoseGeo = new THREE.CylinderGeometry(0.035, 0.07, 1, 6, 1, true).translate(0, 0.5, 0);
  function updateFire(site, dt) {
    const b = site.b, E = site.engine;
    site.t += dt;
    if (!E && (site.callIn -= dt) <= 0) dispatchEngine(site);
    if (E) {
      E.t += dt;
      if (E.phase === 'in' && E.R) {
        const left = (E.stop - E.s) * E.dir;
        const sp = Math.max(1.2, Math.min(13, left * 0.9));
        if (left > 0.3) { E.s += E.dir * sp * dt; driveAlong(E.v, E.R.e, E.s, E.dir); } else { E.phase = 'arrived'; E.t = 0; }
      }
      if (E.phase === 'arrived' && E.t > 1.2) {
        E.phase = 'work';
        const side = new THREE.Vector3(Math.cos(E.v.heading), 0, -Math.sin(E.v.heading));
        site.crew.forEach((c, k) => {
          c.h.root.visible = true; c.h.root.position.copy(E.v.pos).addScaledVector(side, (k % 2 ? -1 : 1) * 1.6);
          // stations around the house, 5-7 m out from the walls the fire is coming through
          const a = (k / 3) * Math.PI * 1.2 - 0.6 + Math.atan2(E.v.pos.x - b.x, E.v.pos.z - b.z);
          c.spot = new THREE.Vector3(b.x + Math.sin(a) * (b.w / 2 + 5.5), 0, b.z + Math.cos(a) * (b.d / 2 + 5.5));
          c.aim = site.flames[(k * 3) % site.flames.length].position;
        });
      }
      if (E.phase === 'work') {
        let spraying = 0;
        for (const c of site.crew) {
          if (walkTo(c.h, c.spot, dt, 3.2)) {
            face(c.h, c.aim); c.h.play('Pistol_Aim_Neutral', 0.2);
            if (!c.hose) { c.hose = new THREE.Mesh(hoseGeo, hoseMat); c.hose.userData.noHit = true; scene.add(c.hose); c.mist = makeSmoke(3, Math.random(), 0.85); scene.add(c.mist); }
            const from = c.h.root.position.clone().add(new THREE.Vector3(Math.sin(c.h.root.rotation.y) * 0.5, 1.25, Math.cos(c.h.root.rotation.y) * 0.5));
            const to = c.aim.clone().add(new THREE.Vector3(0, 1 + Math.sin(site.t * 2 + c.k) * 0.4, 0));
            const dirv = to.clone().sub(from), L = dirv.length();
            c.hose.position.copy(from); c.hose.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dirv.normalize()); c.hose.scale.set(1, L, 1);
            c.hose.visible = site.fire > 0.02; c.mist.position.copy(to).add(new THREE.Vector3(0, -1, 0)); c.mist.visible = c.hose.visible;
            spraying++;
          }
          c.h.update(dt); placeAccessories(c.h);
        }
        site.fire = Math.max(0, site.fire - dt * spraying * 0.009);
        if (site.fire <= 0 && !E.done) { E.done = true; E.t = 0; if (near(new THREE.Vector3(b.x, b.y, b.z), 150)) hud.toast('The fire is out', 2); }
        if (E.done && E.t > 18) {
          // pack up and go
          let back = 0;
          for (const c of site.crew) { if (c.hose) { scene.remove(c.hose, c.mist); c.hose = null; } if (walkTo(c.h, E.v.pos, dt, 2.2)) { c.h.root.visible = false; back++; } c.h.update(dt); placeAccessories(c.h); }
          if (back === site.crew.length) { E.phase = 'leave'; E.v.siren = false; E.t = 0; }
        }
      }
      if (E.phase === 'leave') {
        if (E.R) { E.s += E.dir * Math.min(12, 2 + E.t * 3) * dt; driveAlong(E.v, E.R.e, Math.max(0, Math.min(E.R.e.len, E.s)), E.dir); }
        if (!E.R || E.t > 25 || E.s <= 0 || E.s >= E.R.e.len) { scene.remove(E.v.group); for (const c of site.crew) { scene.remove(c.h.root); c.h.dispose?.(); } site.crew = []; E.phase = 'gone'; }
      }
    }
    // flames follow the fire level; smoke goes from black to white steam
    for (const f of site.flames) { f.visible = site.fire > 0.03; f.scale.setScalar(0.25 + site.fire * 0.85 * (0.9 + Math.sin(site.t * 3 + f.position.x) * 0.1)); faceCamera(f, camera); }
    for (const s of site.smoke) { s.material.uniforms.uDark.value = 0.06 + (1 - site.fire) * 0.75; s.visible = site.fire > 0 || (E && E.phase !== 'gone'); faceCamera(s, camera); }
    if (site.light) site.light.intensity = 40 * site.fire * (0.85 + Math.random() * 0.3);
    // the family watches, then moves out once the engine has gone
    for (const m of site.family) {
      if (!m.at) { if (walkTo(m.h, m.to, dt, 3.4)) { m.at = true; m.h.play(Math.random() < 0.4 ? 'Crouch_Idle_Loop' : 'Idle_Loop', 0.3); } }
      else if (!site.van) face(m.h, new THREE.Vector3(b.x, b.y, b.z));
      m.h.update(dt);
    }
    if (E && E.phase === 'gone' && site.family.length && !site.van) moveOut(site);
    if (site.van) updateVan(site, dt);
    if (E && E.phase === 'gone' && (!site.family.length || site.van?.gone)) {
      // burnt out and empty: it stays like this until the builder starts
      for (const f of site.flames) scene.remove(f);
      for (const s of site.smoke) scene.remove(s);
      if (site.light) site.light.intensity = 0;
      site.flames = []; site.smoke = []; site.light = null;
      site.phase = 'ruin'; site.t0 = abs() - 0;
      P.ruins[site.bi] = { phase: 'ruin', t0: abs() };
      career.saveSoon?.();
    }
  }

  function moveOut(site) {
    const b = site.b, R = roadAt(b);
    const van = new game.Vehicle(lib, 'van'); scene.add(van.group);
    site.van = { v: van, R, s: R ? R.s + 9 : 0, dir: 1, t: 0, phase: 'load' };
    if (R) driveAlong(van, R.e, site.van.s, 1); else { van.pos.set(b.x + (site.d?.nx || 0) * (b.w / 2 + 8), 0, b.z + (site.d?.nz || 1) * (b.d / 2 + 8)); van.pos.y = collision.surface(van.pos.x, van.pos.z, b.y + 3); van.sync?.(0); }
    if (near(van.pos, 120)) hud.toast('The family is moving out', 2.5);
  }
  function updateVan(site, dt) {
    const V = site.van; V.t += dt;
    if (V.phase === 'load') {
      let inside = 0;
      for (const m of site.family) { if (!m.h.root.visible) { inside++; continue; } if (walkTo(m.h, V.v.pos, dt, 1.3)) m.h.root.visible = false; m.h.update(dt); }
      if (inside === site.family.length || V.t > 40) { V.phase = 'go'; V.t = 0; for (const m of site.family) { scene.remove(m.h.root); m.h.dispose?.(); } site.family = []; }
    } else if (V.phase === 'go') {
      if (V.R) { V.s += Math.min(11, 1 + V.t * 2.5) * dt; driveAlong(V.v, V.R.e, Math.min(V.R.e.len, V.s), 1); }
      if (!V.R || V.t > 22 || V.s >= V.R.e.len) { scene.remove(V.v.group); V.gone = true; V.phase = 'done'; }
    }
  }

  // put out and clear away everything from the fire (flames, smoke, engine, crew, family, van)
  function clearFire(site) {
    for (const f of site.flames) scene.remove(f);
    for (const sm of site.smoke) scene.remove(sm);
    if (site.light) site.light.intensity = 0;
    if (site.engine) scene.remove(site.engine.v.group);
    for (const c of site.crew) { if (c.hose) scene.remove(c.hose, c.mist); scene.remove(c.h.root); }
    for (const m of site.family) scene.remove(m.h.root);
    if (site.van) scene.remove(site.van.v.group);
    Object.assign(site, { flames: [], smoke: [], light: null, crew: [], family: [], engine: null, van: null, fire: 0 });
  }

  // ---- the rebuild
  function startBuild(site) {
    site.phase = 'build';
    site.b.ruined = 'build';
    if (!site.group) site.group = buildSite(site);
    P.ruins[site.bi] = { phase: 'build', t0: site.t0 };
    career.saveSoon?.();
  }
  function finish(site) {
    clearFire(site);
    if (site.group) { scene.remove(site.group); site.group.traverse((o) => { if (o.isMesh) o.geometry.dispose(); }); }
    if (site.shell) scene.remove(site.shell);
    for (const w of site.workers || []) scene.remove(w.h.root);
    if (site.pickup) scene.remove(site.pickup.group);
    showHouse(site.bi, true);
    site.b.ruined = false; site.b.hp = 100;
    sites.delete(site.bi);
    delete P.ruins[site.bi];
    career.saveSoon?.();
    if (near(new THREE.Vector3(site.b.x, site.b.y, site.b.z), 150)) hud.toast('The house has been rebuilt', 2.5);
  }
  function updateBuild(site, dt) {
    const k = Math.max(0, (abs() - site.t0 - 2) / TOTAL);
    if (abs() - site.t0 < 2) { if (site.shell) site.shell.visible = true; return; } // waiting on the builder
    if (site.phase !== 'build') startBuild(site);
    if (k >= 1) { finish(site); return; }
    showProgress(site, k);
    // builders on site in working hours, when you're around to see them
    const b = site.b, work = sky.hour >= 7 && sky.hour < 17.5 && near(new THREE.Vector3(b.x, b.y, b.z), 160);
    if (work && !site.workers) {
      site.workers = [0, 1, 2].map((n) => ({ h: worker('build', n), n, t: Math.random() * 4, phase: 'walk', to: null }));
      const R = roadAt(b);
      site.pickup = new game.Vehicle(lib, 'truck'); scene.add(site.pickup.group);
      if (R) driveAlong(site.pickup, R.e, Math.max(0, Math.min(R.e.len, R.s - 9)), 1); else { site.pickup.pos.set(b.x + 8, collision.surface(b.x + 8, b.z, b.y + 3), b.z); site.pickup.sync?.(0); }
      for (const w of site.workers) w.h.root.position.set(b.x + (Math.random() - 0.5) * 4, b.y, b.z + (b.d / 2 + 3) * (site.d?.nz || 1));
    } else if (!work && site.workers) {
      for (const w of site.workers) scene.remove(w.h.root);
      site.workers = null; scene.remove(site.pickup.group); site.pickup = null;
    }
    if (site.workers) for (const w of site.workers) {
      w.t -= dt;
      if (w.phase === 'walk') {
        if (!w.to) { const a = Math.random() * Math.PI * 2; w.to = new THREE.Vector3(b.x + Math.sin(a) * (b.w / 2 + 0.7), 0, b.z + Math.cos(a) * (b.d / 2 + 0.7)); }
        if (walkTo(w.h, w.to, dt, 1.3) || w.t < -12) { w.phase = 'work'; w.t = 4 + Math.random() * 6; face(w.h, new THREE.Vector3(b.x, b.y, b.z)); w.h.play('Interact', 0.2, 1, false); w.knock = 0; }
      } else if (w.phase === 'work') {
        // hammering: the swing and the sound
        if ((w.knock -= dt) <= 0) { w.knock = 0.45 + Math.random() * 0.3; w.h.play('Interact', 0.05, 1.6, true); if (near(w.h.root.position, 40)) game.audio?.thud?.(0.12 * (1 - me().distanceTo(w.h.root.position) / 40)); }
        if (w.t <= 0) { w.phase = 'walk'; w.to = null; w.t = 0; }
      }
      w.h.update(dt); placeAccessories(w.h);
    }
  }

  // ---- explosions next to houses
  const prev = combat.onExplosion;
  combat.onExplosion = (at, power) => {
    prev?.(at, power);
    const reach = power * 0.9;
    B.forEach((b, bi) => {
      if (b.ruined || !(b.style === 4 || (b.style === 5 && b.h < 9) || (b.style === 2 && b.h < 9))) return;
      const dx = Math.max(Math.abs(at.x - b.x) - b.w / 2, 0), dz = Math.max(Math.abs(at.z - b.z) - b.d / 2, 0), dy = Math.max(at.y - (b.y + b.h), 0, b.y - at.y);
      const d = Math.hypot(dx, dz, dy);
      if (d > reach) return;
      b.hp = (b.hp ?? 100) - power * 45 * (1 - d / reach);
      if (b.hp <= 0) destroy(bi, d < 0.01 && dy === 0 ? 'inside' : 'outside');
    });
  };

  // ---- ruins and rebuilds from the save
  for (const [k, R] of Object.entries(P.ruins)) {
    const bi = +k, b = B[bi];
    if (!b) { delete P.ruins[k]; continue; }
    b.ruined = R.phase === 'build' ? 'build' : 'fire';
    showHouse(bi, false);
    const site = { bi, b, d: game.estate?.doors?.[bi] || null, phase: 'ruin', fire: 0, t: 0, flames: [], smoke: [], crew: [], family: [], seed: bi * 13 + 5, t0: R.t0 };
    site.shell = buildShell(b, site.seed); scene.add(site.shell);
    sites.set(bi, site);
  }

  game.demolition = { sites, destroy: (bi) => destroy(bi, 'outside'), finish: (bi) => { const s = sites.get(bi); if (s) finish(s); } };
  return {
    update(dt) {
      for (const site of [...sites.values()]) {
        if (site.phase === 'burn') {
          // you left: the fire burns out, the people and trucks go home
          if (!near(new THREE.Vector3(site.b.x, site.b.y, site.b.z), 420)) {
            clearFire(site);
            Object.assign(site, { phase: 'ruin', t0: abs() });
            P.ruins[site.bi] = { phase: 'ruin', t0: site.t0 };
            continue;
          }
          updateFire(site, dt);
        } else { if (site.engine || site.flames.length) clearFire(site); updateBuild(site, dt); }
      }
    },
  };
}
