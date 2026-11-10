// John Cortes and the Gulf Line crew: fourteen people, a hideout on the edge of
// Port Calvera, and the prologue that drops you in right after loading.
//
// Every member has a name, a job in the crew, a personality and their own look
// (skin tone, outfit and hair colours, build, accessories). At the hideout you
// can talk to them; most of them can do something for you for a price
// (repairs, towing, healing, scopes made from your supplies, buying your
// cars...).
import * as THREE from 'three';
import { shadePerson } from '../entities/bodyshade.js';
import { findHilltop, buildTrack } from '../world/hilltop.js';
import { Human } from '../entities/human.js';
import { CITY } from '../world/layout.js';
import { nearestRoad, money, keyHint } from './world-util.js';
import { ShopUI } from '../ui/shop.js';
import { wrapAngle } from '../util.js';

export const PLAYER_NAME = 'John Cortes';

// skin tones, outfit tints, hair colours
const SKIN = { light: [1.05, 0.98, 0.95], tan: [0.92, 0.8, 0.68], olive: [0.85, 0.72, 0.55], brown: [0.62, 0.47, 0.36], dark: [0.42, 0.31, 0.25] };
const HAIR = { black: 0x141210, brown: 0x3b2618, blond: 0xb89a62, grey: 0x8a8580, red: 0x6e2a14, dyed: 0x7a1b3e };

export const GANG = [
  { id: 'rico', name: 'Rico "Big Money" Delgado', role: 'Leader', base: 'mh_m2', skin: 'olive', suit: [0.95, 0.85, 0.6], hair: 'black', h: 1.03, w: 1.12, acc: ['fedora', 'chain'],
    about: 'Runs the Gulf Line. In it for the money and not shy about it. Funny, until he isn\'t.', lines: ['If it pays, it stays.', 'John! My favourite employee. Don\'t tell the others.', 'Rent\'s due Friday. Kidding. Mostly.'] },
  { id: 'tina', name: 'Tina Navarro', role: 'Gunsmith', base: 'mh_f1', skin: 'tan', suit: [0.55, 0.6, 0.5], hair: 'black', h: 0.98, w: 0.98, acc: ['bandana'], service: 'gunsmith',
    about: 'Builds scopes, grips and suppressors out of whatever you bring her.', lines: ['Bring me parts, I\'ll bring you accuracy.', 'Don\'t touch the bench.'] },
  { id: 'deshawn', name: 'DeShawn "Wrench" Carter', role: 'Mechanic', base: 'mh_m1', skin: 'dark', suit: [0.35, 0.45, 0.75], hair: 'black', h: 1.05, w: 1.08, acc: ['cap'], service: 'mechanic',
    about: 'Can fix anything with an engine. Will also tow it home if you wreck it.', lines: ['What did you do to her this time?', 'It\'s always the alternator.'] },
  { id: 'marisol', name: 'Marisol Reyes', role: 'Medic', base: 'mh_f2', skin: 'olive', suit: [0.9, 0.92, 0.95], hair: 'brown', h: 0.96, w: 0.95, acc: [], service: 'medic',
    about: 'Dropped out of nursing school two credits short. Patches up the crew.', lines: ['Sit still or I\'ll stitch your mouth too.', 'You\'re bleeding on my floor.'] },
  { id: 'cap', name: 'Earl "Cap" Boudreaux', role: 'Boat captain', base: 'mh_m3', skin: 'light', suit: [0.7, 0.55, 0.4], hair: 'grey', h: 1.0, w: 1.15, acc: ['cap'], service: 'captain',
    about: 'Forty years on the bayou. Hauls boats, cars and anything else out of the water.', lines: ['Water don\'t care who you are.', 'Lost another car in the bay, son?'] },
  { id: 'nina', name: 'Nina Park', role: 'Hacker', base: 'mh_f1', skin: 'light', suit: [0.2, 0.2, 0.22], hair: 'dyed', h: 0.95, w: 0.92, acc: ['glasses'], service: 'hacker',
    about: 'Gets into police dispatch. For a fee she can make a warrant go away.', lines: ['Your bounty is in a database. Databases can be... edited.', 'Don\'t talk to me while I\'m typing.'] },
  { id: 'lalo', name: 'Eduardo "Lalo" Fuentes', role: 'Fence', base: 'mh_m4', skin: 'tan', suit: [0.75, 0.2, 0.2], hair: 'black', h: 0.97, w: 1.0, acc: ['chain', 'glasses'], service: 'fence',
    about: 'Buys anything with wheels, no paperwork, no questions.', lines: ['Everything has a price, primo.', 'That truck? I\'ll give you scrap value and a smile.'] },
  { id: 'big-o', name: 'Otis "Big O" Freeman', role: 'Muscle', base: 'mh_m1', skin: 'brown', suit: [0.25, 0.25, 0.25], hair: 'black', h: 1.1, w: 1.3, acc: ['beanie'],
    about: 'Doesn\'t say much. Doesn\'t need to.', lines: ['...', 'Mm.'] },
  { id: 'sofia', name: 'Sofia Alvarez', role: 'Driver', base: 'mh_f2', skin: 'tan', suit: [0.8, 0.5, 0.15], hair: 'brown', h: 0.99, w: 0.95, acc: ['glasses'],
    about: 'Wheelwoman. Has never lost a chase and never lets anyone forget it.', lines: ['You drive like my abuela. She was a better driver.', 'Get in, loser. We\'re going robbing.'] },
  { id: 'hector', name: 'Hector Vega', role: 'Cook', base: 'mh_m3', skin: 'olive', suit: [0.95, 0.95, 0.92], hair: 'grey', h: 0.98, w: 1.18, acc: ['cap'], service: 'cook',
    about: 'Keeps the crew fed. Gumbo on Sundays, tamales when he\'s happy.', lines: ['Eat something, you look like a ghost.', 'Gumbo\'s on the stove.'] },
  { id: 'jayden', name: 'Jayden Brooks', role: 'Lookout', base: 'mh_m4', skin: 'dark', suit: [0.3, 0.6, 0.4], hair: 'black', h: 0.95, w: 0.9, acc: ['beanie'], service: 'lookout',
    about: 'Nineteen. Watches the roads and the police scanner.', lines: ['Cops are quiet tonight. Too quiet.', 'Saw a black SUV drive by twice.'] },
  { id: 'vera', name: 'Vera Lindqvist', role: 'Pilot', base: 'mh_f1', skin: 'light', suit: [0.45, 0.5, 0.35], hair: 'blond', h: 1.02, w: 0.94, acc: ['glasses'],
    about: 'Ex-crop duster. Flies anything, lands it mostly in one piece.', lines: ['Fuel\'s expensive, darling. Make it worth my while.', 'I\'ve landed on worse roads than yours.'] },
  { id: 'smoke', name: 'Andre "Smoke" Batiste', role: 'Smuggler', base: 'mh_m2', skin: 'brown', suit: [0.5, 0.35, 0.6], hair: 'black', h: 1.0, w: 1.0, acc: ['chain'],
    about: 'Moves packages up and down the coast. Never asks what\'s inside.', lines: ['Package goes in, money comes out.', 'Don\'t open it.'] },
  { id: 'mateo', name: 'Mateo Cruz', role: 'Recruit', base: 'mh_m4', skin: 'tan', suit: [0.6, 0.65, 0.7], hair: 'brown', h: 0.93, w: 0.9, acc: ['cap'],
    about: 'Joined last month. Wants to be like you. Probably shouldn\'t.', lines: ['Teach me how to drift, John!', 'Rico says I\'m on probation. Forever.'] },
];

// Small accessories (built from simple shapes) placed on the head every frame
function accessory(kind) {
  const g = new THREE.Group();
  const m = (c, r = 0.7, metal = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: metal });
  if (kind === 'cap' || kind === 'fedora') {
    const crown = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), m(kind === 'cap' ? 0x223355 : 0x2a2420));
    crown.scale.set(1, kind === 'fedora' ? 1.15 : 0.8, 1.08);
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(kind === 'fedora' ? 0.16 : 0.1, kind === 'fedora' ? 0.16 : 0.1, 0.008, 20), crown.material);
    if (kind === 'cap') { brim.scale.set(0.9, 1, 1.1); brim.position.set(0, 0.0, 0.08); } else brim.position.y = 0.0;
    g.add(crown, brim);
    if (kind === 'fedora') { const band = new THREE.Mesh(new THREE.CylinderGeometry(0.107, 0.107, 0.022, 20, 1, true), m(0x111111)); band.position.y = 0.025; g.add(band); }
    g.userData.at = [0, 0.11, -0.005];
  } else if (kind === 'beanie') {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.108, 16, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), m(0x3a3a40, 0.95));
    b.scale.y = 1.05; g.add(b); g.userData.at = [0, 0.085, -0.01];
  } else if (kind === 'bandana') {
    const b = new THREE.Mesh(new THREE.TorusGeometry(0.098, 0.018, 8, 24), m(0x8b1a1a, 0.9));
    b.rotation.x = Math.PI / 2; g.add(b); g.userData.at = [0, 0.09, 0];
  } else if (kind === 'glasses') {
    const lens = m(0x050505, 0.1, 0.6);
    for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.026, 0.006), lens); l.position.set(s * 0.032, 0, 0); g.add(l); }
    const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.004, 0.004), lens); g.add(bridge);
    g.userData.at = [0, 0.045, 0.098];
  } else if (kind === 'chain') {
    const c = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.006, 6, 28), m(0xd4af37, 0.25, 1));
    c.rotation.x = Math.PI / 2.3; g.add(c); g.userData.at = [0, -0.17, 0.03]; g.userData.neck = true;
  }
  g.traverse((o) => { if (o.isMesh) o.castShadow = true; });
  return g;
}

// A person dressed as one of the crew
export function dressMember(lib, M) {
  const id = lib.people[M.base] ? M.base : lib.peopleIds[Math.abs(hash(M.id)) % lib.peopleIds.length];
  const h = new Human(lib, id);
  h.model.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    const out = mats.map((mt) => {
      const c = mt.clone();
      if (mt.name === 'skin') c.color.setRGB(...(SKIN[M.skin] || SKIN.tan));
      else if (mt.name === 'suit') c.color.setRGB(...M.suit);
      else if (mt.name === 'hair' || mt.name === 'eyebrows') c.color.set(HAIR[M.hair] || HAIR.black);
      return c;
    });
    o.material = Array.isArray(o.material) ? out : out[0];
  });
  shadePerson(h.model); // the recoloured copies get the skin/hair/cloth lighting too
  h.model.scale.set(M.w, M.h, M.w);
  h.acc = (M.acc || []).map(accessory);
  h.acc.forEach((a) => h.root.add(a));
  h.headBone = h.model.getObjectByName('head');
  return h;
}
function hash(s) { let x = 0; for (const c of s) x = (x * 31 + c.charCodeAt(0)) | 0; return x; }
const _v = new THREE.Vector3(), _q = new THREE.Quaternion();
// keep hats/glasses on the head as it moves
export function placeAccessories(h) {
  if (!h.acc || !h.headBone) return;
  h.root.updateMatrixWorld(true);
  h.headBone.getWorldPosition(_v);
  h.root.worldToLocal(_v);
  for (const a of h.acc) {
    const at = a.userData.at;
    a.position.set(_v.x + at[0], _v.y + at[1], _v.z + at[2]);
  }
}

export function installGang(game) {
  const { career, hud, scene, collision, hm, graph, lib, player, S, interact } = game;
  const P = career.p;
  P.name = PLAYER_NAME;
  P.story = P.story || { prologue: false };
  P.supplies = P.supplies || { metal: 0, glass: 0, springs: 0 };

  // ---------------- the hideout: a yard on a small summit far out in the country,
  // looking down over an open valley (a gang that doesn't want visitors)
  const hill = findHilltop(hm, graph, collision);
  const spot = hill ? { x: hill.x, z: hill.z, face: hill.face, road: hill.road } : (() => {
    let best = null;
    for (let i = 0; i < 40; i++) {
      const x = CITY.x0 + CITY.nx * CITY.pitch + 120 + (i % 8) * 25, z = CITY.z0 + 120 + Math.floor(i / 8) * 60;
      const r = nearestRoad(graph, x, z);
      if (!r) continue;
      const nx = -r.tz, nz = r.tx, cx = r.x + nx * 26, cz = r.z + nz * 26;
      const ys = [[-12, -12], [12, -12], [-12, 12], [12, 12]].map(([a, b]) => hm.height(cx + a, cz + b));
      const flat = Math.max(...ys) - Math.min(...ys);
      if (hm.waterLevel(cx, cz) > hm.height(cx, cz) - 0.5) continue;
      let blocked = false;
      collision.query(cx, cz, 16, (it) => { if (it.t === 0) blocked = true; });
      if (blocked) continue;
      if (!best || flat < best.flat) best = { x: cx, z: cz, flat, road: r, face: Math.atan2(-nx, -nz) };
    }
    return best || { x: CITY.x0 + CITY.nx * CITY.pitch + 160, z: CITY.z0 + 200, face: 0 };
  })();
  const HQ = { x: spot.x, z: spot.z, y: hm.height(spot.x, spot.z), face: spot.face };
  game.hideout = HQ;
  const local = (lx, lz) => { const c = Math.cos(HQ.face), s = Math.sin(HQ.face); return { x: HQ.x + lx * c + lz * s, z: HQ.z - lx * s + lz * c }; };
  // a dirt track up from the road, arriving at the back of the yard
  if (hill && spot.road) { const back = local(0, -16); HQ.track = buildTrack(scene, hm, { x: spot.road.x, z: spot.road.z }, back); HQ.gate = back; }
  const groundY = (x, z) => collision.surface(x, z, HQ.y + 20);

  // set dressing from the open models (containers, couch, pallets, barrels, trash...)
  const props = [];
  const putProp = async (rel, lx, lz, rot = 0, size = null) => {
    const { loadOpen, instance } = await import('../assets/open.js');
    const g = await loadOpen('real/zk_props/' + rel + '.glb');
    if (!g) return;
    const o = instance(g, size || 1, size ? 'max' : 'max');
    if (!size) o.scale.setScalar(1);
    const p = local(lx, lz);
    o.position.set(p.x, groundY(p.x, p.z), p.z);
    o.rotation.y = HQ.face + rot;
    o.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; m.userData.hitStatic = true; m.userData.surf = 'wood'; } });
    scene.add(o);
    props.push(o);
    const s = o.userData.size;
    if (s && Math.max(s.x, s.z) > 1.2) collision.addCircle(p.x, p.z, Math.min(s.x, s.z) * 0.45);
    return o;
  };
  (async () => {
    await putProp('Container_Green', -9, -8, 0.05, 6.0);
    await putProp('Container_Red', 9, -9, -0.1, 6.0);
    await putProp('Couch', -3, -3, 0.3, 2.1);
    await putProp('Barrel', 1.5, -1.5, 0, 0.9);
    await putProp('Barrel', 6.5, 3, 0, 0.9);
    await putProp('Pallet', -6, 2, 0.4, 1.2);
    await putProp('Pallet_Broken', -6.5, 3.2, 1.2, 1.2);
    await putProp('Wheels_Stack', 7.5, -3, 0, 1.1);
    await putProp('CinderBlock', 3.5, -5.5, 0.3, 0.4);
    await putProp('CinderBlock', 3.9, -5.2, 1.1, 0.4);
    await putProp('TrashBag_1', -9.5, -4, 0, 0.7);
    await putProp('TrashBag_2', -8.6, -3.7, 0.5, 0.8);
    await putProp('Pipes', 10, 0, 0.6, 2.4);
    await putProp('Wheel', 5.2, 4.5, 1.2, 0.75);
  })();
  // burning barrel: flickering firelight
  const fire = new THREE.PointLight(0xff8a3a, 0, 9, 2);
  { const p = local(1.5, -1.5); fire.position.set(p.x, groundY(p.x, p.z) + 1.3, p.z); }
  scene.add(fire);
  // flames: a camera-facing quad with a scrolling-noise flame shader
  const flameMat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: `uniform float uTime; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float n(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f); return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      void main(){
        vec2 p = vUv; float t = uTime;
        float noise = n(vec2(p.x * 5.0, p.y * 4.0 - t * 3.2)) * 0.6 + n(vec2(p.x * 11.0, p.y * 8.0 - t * 5.0)) * 0.4;
        float shape = smoothstep(0.5, 0.0, abs(p.x - 0.5) * (1.4 + p.y * 1.6)) * smoothstep(1.0, 0.15, p.y + noise * 0.45) * smoothstep(0.0, 0.08, p.y);
        vec3 col = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.85, 0.35), smoothstep(0.2, 0.9, shape));
        gl_FragColor = vec4(col * shape * 1.6, shape);
      }`,
  });
  const ember = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 1.05).translate(0, 0.5, 0), flameMat);
  ember.position.copy(fire.position).add(new THREE.Vector3(0, -0.45, 0));
  ember.userData.noHit = true; ember.userData.noReflect = true;
  scene.add(ember);

  // ---------------- the crew at the hideout
  const POSES = ['Idle_Talking_Loop', 'Idle_Loop', 'Sitting_Idle_Loop', 'Crouch_Idle_Loop'];
  const SPOTS = [[0, 2, 'Idle_Talking_Loop'], [-3.2, -2.6, 'Sitting_Idle_Loop'], [-2.4, -2.9, 'Sitting_Idle_Loop'], [2.6, -0.6, 'Idle_Loop'], [0.6, -2.6, 'Idle_Talking_Loop'],
    [5.5, -2.5, 'Crouch_Idle_Loop'], [-6, 4, 'Idle_Loop'], [7, 2, 'Idle_Talking_Loop'], [-1.5, 5, 'Idle_Loop'], [3, 4.6, 'Idle_Talking_Loop'], [8, -6, 'Idle_Loop'],
    [-8, -1, 'Idle_Loop'], [4.5, 1.5, 'Idle_Talking_Loop'], [-4.5, 0.5, 'Idle_Loop']];
  // everyone at the yard is a friend: aiming at them greys the reticle and the gun won't fire
  game.friendlies = () => crew.filter((m) => m.h.root.visible).map((m) => m.h.root.position);
  const crew = GANG.map((M, i) => {
    const h = dressMember(lib, M);
    const [lx, lz, pose] = SPOTS[i % SPOTS.length];
    const p = local(lx, lz);
    const pos = new THREE.Vector3(p.x, groundY(p.x, p.z), p.z);
    if (pose === 'Sitting_Idle_Loop') pos.y += 0.05;
    h.root.position.copy(pos);
    const look = Math.atan2(HQ.x - p.x, HQ.z - p.z) + (Math.random() - 0.5) * 0.8;
    h.root.rotation.y = look;
    h.play(pose, 0);
    if (h.mixer) h.mixer.setTime(Math.random() * 3);
    scene.add(h.root);
    const m = { M, h, pos, look, pose, talkT: 0 };
    interact.add({ x: pos.x, z: pos.z, r: 2.2, marker: false, show: () => !S.indoors && S.mode === 'foot' && !game.storyBusy?.() && !m.away,
      label: () => `${keyHint(game)} talk to ${M.name.replace(/".*"\s/, '')} · ${M.role}`, use: () => talk(m) });
    return m;
  });

  // ---------------- talking + services
  let talkWith = null;
  const svc = new ShopUI({
    title: 'Gulf Line', tabs: [{ k: 'talk', label: 'Talk' }],
    getMoney: () => career.money, pause: game.pause,
    note: () => (talkWith ? `${talkWith.M.name} — ${talkWith.M.role}. ${talkWith.M.about}` : ''),
    items: () => (talkWith ? services(talkWith.M) : []),
    row: (it) => ({ name: it.name, sub: it.sub, stats: [], btn: it.price ? money(it.price) : it.btn || 'Ask', cls: it.dis ? 'dis' : '' }),
    act: (it) => { if (it.dis) return; if (it.price && !career.spend(it.price)) return; it.run(); career.saveSoon(); },
  });
  game.gangServices = svc;
  const say = (who, line, t = 3) => (game.law && game.law.say ? game.law.say(who, line, t) : hud.toast(`${who}: ${line}`, t));

  function services(M) {
    const out = [{ name: 'Chat', sub: '"' + M.lines[(Math.random() * M.lines.length) | 0] + '"', btn: 'Talk', run: () => say(M.name.split(' ')[0], M.lines[(Math.random() * M.lines.length) | 0]) }];
    const last = game.lastVehicle?.();
    if (M.service === 'mechanic') {
      out.push({ name: 'Fix my ride', sub: last ? `${last.spec.name} · ${Math.round(last.health)}/${last.maxHealth}` : 'no car', price: 180, dis: !last, run: () => { last.health = last.maxHealth; last.dmg = null; last.wrecked = false; say('Wrench', 'Good as new. Well. Good as used.'); } });
      out.push({ name: 'Tow my car to the hideout', sub: last ? last.spec.name : 'no car', price: 250, dis: !last, run: () => { const p = local(0, 9); last.pos.set(p.x, groundY(p.x, p.z), p.z); last.vel.set(0, 0); last.heading = HQ.face; say('Wrench', 'She\'s out front.'); } });
    }
    if (M.service === 'captain') out.push({ name: 'Haul my car out of the water', sub: last ? last.spec.name : 'no car', price: 600, dis: !last, run: () => { const r = nearestRoad(graph, last.pos.x, last.pos.z); if (r) { last.pos.set(r.x, groundY(r.x, r.z), r.z); last.vel.set(0, 0); last.drowned = false; } say('Cap', 'Fished her out. She smells like catfish now.'); } });
    if (M.service === 'medic') out.push({ name: 'Patch me up', sub: `Health ${Math.round(player.health)}`, price: 60, run: () => { player.health = 100; player.armor = Math.max(player.armor, 25); say('Marisol', 'Try not to get shot for a week.'); } });
    if (M.service === 'hacker') out.push({ name: 'Wipe my bounty', sub: `Bounty $${(P.law?.bounty || 0).toLocaleString('en-US')}`, price: Math.max(500, Math.round((P.law?.bounty || 0) * 0.6)), dis: !(P.law?.bounty > 0), run: () => { P.law.bounty = 0; P.law.nextHunt = 0; say('Nina', 'Done. You never existed. Well, the warrant didn\'t.'); } });
    if (M.service === 'cook') out.push({ name: 'Bowl of gumbo', sub: 'Restores health and fills you up', price: 15, run: () => { player.health = Math.min(100, player.health + 40); game.feed?.(40); say('Hector', 'Careful, it\'s hot.'); } });
    if (M.service === 'lookout') out.push({ name: 'Anything on the scanner?', sub: '', btn: 'Ask', run: () => say('Jayden', P.law?.bounty > 0 ? `There's $${P.law.bounty.toLocaleString('en-US')} on your head. Hunters come round every few days.` : 'You\'re clean. For now.', 4) });
    if (M.id === 'rico' && !P.ricoTruck) out.push({ name: 'Buy Rico\'s rusty pickup', sub: 'Rusty \'89 pickup · runs, mostly', price: 400, run: () => {
      P.ricoTruck = true;
      const p = local(0, 11), v = new game.Vehicle(lib, 'rusty-pickup');
      v.pos.set(p.x, groundY(p.x, p.z), p.z); v.heading = HQ.face + Math.PI / 2; v.sync(0); scene.add(v.group); game.parked.push(v);
      const g = { uid: `v${Date.now() % 100000}`, cat: 'car', type: 'rusty-pickup', up: {} }; v.uid = g.uid; P.garage.push(g); career.save();
      say('Rico', 'Pleasure. She pulls left. Everything pulls left in this town.');
    } });
    if (M.service === 'fence') {
      const mine = game.parkedNear?.(HQ, 40) || [];
      for (const v of mine.slice(0, 4)) {
        const val = Math.round((v.type === 'rusty-pickup' ? 250 : 2500) * (v.health / (v.maxHealth || 100)));
        out.push({ name: `Sell the ${v.spec.name}`, sub: 'parked at the hideout', btn: `+$${val}`, run: () => { game.sellVehicle?.(v); S.money += val; say('Lalo', 'Pleasure doing business.'); } });
      }
      if (!mine.length) out.push({ name: 'Sell a vehicle', sub: 'park it at the hideout first', btn: '—', dis: true, run: () => {} });
    }
    if (game.crewItems) out.push(...game.crewItems(M)); // loyalty, gifts, favours (systems/crew.js)
    if (M.service === 'gunsmith') {
      const s = P.supplies;
      const have = (k, n) => (s[k] || 0) >= n;
      out.push({ name: 'Make me a 4x scope', sub: `needs 2 metal, 1 glass (you have ${s.metal}/${s.glass})`, price: 300, dis: !(have('metal', 2) && have('glass', 1)),
        run: () => { s.metal -= 2; s.glass -= 1; game.giveAttachment?.('optic_4x-scope_1'); say('Tina', 'Zeroed at a hundred yards. Don\'t drop it.'); } });
      out.push({ name: 'Make me a suppressor', sub: `needs 3 metal, 1 spring (you have ${s.metal}/${s.springs})`, price: 450, dis: !(have('metal', 3) && have('springs', 1)),
        run: () => { s.metal -= 3; s.springs -= 1; game.giveAttachment?.('muzzle_suppressor_1'); say('Tina', 'Quieter. Not silent. Movies lie.'); } });
      out.push({ name: 'Buy scrap metal', sub: 'supplies', price: 40, run: () => { s.metal++; } });
      out.push({ name: 'Buy a glass lens', sub: 'supplies', price: 90, run: () => { s.glass++; } });
      out.push({ name: 'Buy a spring kit', sub: 'supplies', price: 60, run: () => { s.springs++; } });
    }
    return out;
  }
  function talk(m) {
    talkWith = m;
    m.h.root.rotation.y = Math.atan2(player.pos.x - m.pos.x, player.pos.z - m.pos.z);
    m.talkT = 4;
    say(m.M.name.split(' ')[0].replace(/"/g, ''), m.M.lines[(Math.random() * m.M.lines.length) | 0], 3);
    svc.show('talk', m.M.name);
  }

  // ---------------- prologue: straight in after the loading screen
  const rico = crew[0];
  let pro = null;
  const skip = typeof window !== 'undefined' && (window.SB_SKIP_INTRO || /nointro/.test(location.search));
  const CAPTIONS = [];
  const banner = document.createElement('div');
  banner.className = 'sbcaption';
  document.body.appendChild(banner);
  const caption = (title, sub) => { banner.innerHTML = `<b>${title}</b><span>${sub}</span>`; banner.classList.add('show'); };
  const skipBtn = document.createElement('button');
  skipBtn.className = 'sbskip'; skipBtn.textContent = 'Skip ▸';
  skipBtn.onclick = () => { if (pro && pro.phase === 'intro') pro.t = 1e9; };
  document.body.appendChild(skipBtn);
  void CAPTIONS;

  function startPrologue() {
    const p = local(0.5, 9.5); // by the truck, out of the close-ups
    player.pos.set(p.x, groundY(p.x, p.z), p.z);
    document.body.classList.add('cinematic');
    player.heading = Math.atan2(rico.pos.x - p.x, rico.pos.z - p.z);
    game.rig.yaw = player.heading;
    game.sky.hour = 17.4;
    pro = { phase: 'intro', t: 0, shot: -1 };
    S.dead = 999; S.cutscene = true;
    skipBtn.classList.add('show');
  }
  // the members, introduced a few at a time
  const SHOTS = [
    { who: [0], t: 6.5, line: ['Rico', 'Well, look who finally showed up. John Cortes, ladies and gentlemen. Welcome to the Gulf Line, kid.'] },
    { who: [1, 2, 3], t: 5, line: ['Rico', 'Tina builds the guns, Wrench fixes the cars, Marisol fixes you when the guns and cars go wrong.'] },
    { who: [4, 5, 6], t: 5, line: ['Rico', 'Cap hauls stuff out of the water. Nina hacks things. Lalo buys anything with wheels and no paperwork.'] },
    { who: [7, 8, 9], t: 5, line: ['Rico', 'Big O is the muscle. Sofia drives. Hector cooks, and his gumbo is the only reason anyone stays.'] },
    { who: [10, 11, 12, 13], t: 6, line: ['Rico', 'Jayden watches the roads, Vera flies, Smoke moves packages, and Mateo... Mateo is on probation. Forever.'] },
    { who: [0], t: 6.5, line: ['Rico', 'Now. Business. You\'ll want a piece. Walt at Calvera Arms sells a standard nine. No, I\'m not buying it for you. This is a gang, not a charity.'] },
    { who: ['truck'], t: 6.5, line: ['Rico', 'And that beauty out front is mine. Rusty, ugly, paid for. You want her? Four hundred, cash, whenever you have it. Family price.'] },
    { who: [0], t: 4.5, line: ['Rico', 'Come on. Drive me into the city. I\'ll show you where the money is.'] },
  ];
  let truck = null, leftTruck = null;
  function spawnTruck() {
    if (truck) return truck;
    const p = local(0, 11);
    truck = new game.Vehicle(lib, 'rusty-pickup');
    truck.pos.set(p.x, groundY(p.x, p.z), p.z);
    truck.heading = HQ.face + Math.PI / 2;
    truck.sync(0); truck.issued = true; // you drive it with Rico's say-so
    scene.add(truck.group);
    game.parked.push(truck);
    return truck; // Rico's, not yours: buy it from him at the yard
  }

  // ---------------- Rico rides along: he walks round to the passenger door, opens it and
  // climbs in, rides with you (turning to you when he talks), and at the drop-off he
  // gets out, shuts the door and walks off down the sidewalk to his meeting
  const ride = { st: null, t: 0, v: null, to: null, talk: 0, home: null };
  const me = () => (S.mode === 'car' && S.vehicle ? S.vehicle.pos : player.pos); // where you are (on foot or at the wheel)
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _up = new THREE.Vector3();
  const sideDoor = (v, side) => {
    const left = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading)), fwd = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading));
    return v.pos.clone().addScaledVector(left, side * (v.spec.width / 2 + 0.55)).addScaledVector(fwd, (v.spec.wf || 1.3) * 0.2);
  };
  function walkTo(m, target, dt, speed = 1.4) {
    const d = new THREE.Vector3().subVectors(target, m.pos); d.y = 0;
    const L = d.length();
    if (L < 0.25) return true;
    const want = Math.atan2(d.x, d.z);
    m.h.root.rotation.set(0, m.h.root.rotation.y + wrapAngle(want - m.h.root.rotation.y) * Math.min(1, dt * 7), 0);
    m.pos.addScaledVector(d.normalize(), Math.min(L, speed * dt));
    m.pos.y = collision.surface(m.pos.x, m.pos.z, m.pos.y + 1.2);
    m.h.root.position.copy(m.pos);
    m.h.play(speed > 2.4 ? 'Jog_Fwd_Loop' : 'Walk_Loop', 0.25);
    return false;
  }
  const turnHead = (h, ang) => {
    const b = h.model.getObjectByName('neck01'); if (!b || !b.parent) return;
    h.root.updateMatrixWorld(true);
    _up.set(0, 1, 0).applyQuaternion(h.root.quaternion);
    b.getWorldQuaternion(_q1); _q2.setFromAxisAngle(_up, ang).multiply(_q1);
    b.parent.getWorldQuaternion(_q3).invert(); b.quaternion.copy(_q3.multiply(_q2));
  };
  function rideStart(v) {
    if (ride.st || !v) return;
    ride.st = 'toCar'; ride.v = v; ride.t = 0; rico.away = true;
    ride.home = { pos: rico.pos.clone(), rot: rico.h.root.rotation.y };
  }
  function rideSay(line, t = 5) { say('Rico', line, t); ride.talk = Math.min(t, 4); }
  function rideUpdate(dt) {
    const v = ride.v, m = rico;
    ride.t += dt; ride.talk = Math.max(0, ride.talk - dt);
    if (!v || !v.group.parent) { rideEnd(); return; }
    const pd = v.door ? v.door('door-pass') : null;
    if (ride.st === 'toCar') {
      const at = sideDoor(v, -1);
      const near = me().distanceTo(m.pos) < 30;
      if (walkTo(m, at, dt, near && m.pos.distanceTo(at) > 6 ? 2.8 : 1.4) || ride.t > 25) { ride.st = 'open'; ride.t = 0; m.h.play('Interact', 0.1, 1.5, true); }
    } else if (ride.st === 'open') {
      m.h.root.rotation.y += wrapAngle(Math.atan2(v.pos.x - m.pos.x, v.pos.z - m.pos.z) - m.h.root.rotation.y) * Math.min(1, dt * 10);
      if (pd) pd.rotation.y = pd.userData.open * Math.min(1, ride.t / 0.45);
      if (ride.t > 0.6) { ride.st = 'riding'; ride.t = 0; m.h.play('Sitting_Idle_Loop', 0.2, 1, true); if (!v.cabLayout) m.h.root.visible = false; }
    } else if (ride.st === 'riding') {
      if (pd && ride.t < 0.6) pd.rotation.y = pd.userData.open * Math.max(0, 1 - ride.t / 0.5);
    } else if (ride.st === 'out') {
      if (pd) pd.rotation.y = pd.userData.open * Math.min(1, ride.t / 0.4);
      if (ride.t > 0.45) {
        const at = sideDoor(v, -1);
        m.pos.set(at.x, collision.surface(at.x, at.z, v.pos.y + 1.5), at.z);
        m.h.root.position.copy(m.pos); m.h.root.rotation.set(0, v.heading, 0); m.h.root.visible = true; m.h.post = null;
        ride.st = 'shut'; ride.t = 0; m.h.play('Idle_Loop', 0.2, 1, true);
      }
    } else if (ride.st === 'shut') {
      if (pd) pd.rotation.y = pd.userData.open * Math.max(0, 1 - ride.t / 0.4);
      if (ride.t > 0.5) {
        // down the sidewalk on the passenger side, the way the truck was facing
        const f = new THREE.Vector3(Math.sin(v.heading), 0, Math.cos(v.heading)), left = new THREE.Vector3(Math.cos(v.heading), 0, -Math.sin(v.heading));
        ride.to = m.pos.clone().addScaledVector(left, -2.6).addScaledVector(f, 38);
        ride.st = 'leave'; ride.t = 0;
      }
    } else if (ride.st === 'leave') {
      const done = walkTo(m, ride.to, dt, 1.45);
      const far = m.pos.distanceTo(me()) > 60;
      if (done || far || ride.t > 40) rideEnd();
    }
    if (ride.st === 'riding') {
      if (v.cabLayout) {
        v.seat(m.h, 1); m.h.update(dt);
        // he looks over at you when he talks, and out of the window otherwise
        ride.look = (ride.look || 0) + ((ride.talk > 0 ? 0.75 : Math.sin(ride.t * 0.21) * 0.35 - 0.15) - (ride.look || 0)) * Math.min(1, dt * 3);
        turnHead(m.h, ride.look);
        placeAccessories(m.h);
      }
    } else if (ride.st) { m.h.update(dt); placeAccessories(m.h); }
  }
  function rideEnd() {
    const m = rico;
    if (ride.home) { m.pos.copy(ride.home.pos); m.h.root.position.copy(m.pos); m.h.root.rotation.set(0, ride.home.rot, 0); }
    m.h.post = null; m.h.play(m.pose, 0.2, 1, true); m.away = false;
    ride.st = null; ride.v = null;
    S.holdCar = false;
  }
  game.rico = { get state() { return ride.st; }, get truck() { return truck || leftTruck; }, get dest() { return pro?.dest || null; }, get phase() { return pro?.phase || null; }, get pos() { return rico.pos; } };

  function updatePrologue(dt, a) {
    pro.t += dt;
    if (pro.phase === 'intro') {
      if (a.pause || a.enter) pro.t = Math.max(pro.t, 0); // (Esc opens the pause menu as usual)
      let acc = 0, idx = SHOTS.length;
      for (let i = 0; i < SHOTS.length; i++) { if (pro.t < acc + SHOTS[i].t) { idx = i; break; } acc += SHOTS[i].t; }
      if (idx !== pro.shot) {
        pro.shot = idx;
        const sh = SHOTS[idx];
        if (sh) {
          say(sh.line[0], sh.line[1], sh.t);
          if (!sh.who.some((w) => typeof w === 'number')) banner.classList.remove('show');
          pro.capFor = null;
          if (sh.who[0] === 'truck') spawnTruck();
        }
      }
      if (idx >= SHOTS.length) {
        // control back to you: get in the truck
        spawnTruck();
        game.combat.holstered = true;
        banner.classList.remove('show'); skipBtn.classList.remove('show');
        document.body.classList.remove('cinematic');
        S.dead = 0; S.cutscene = false;
        pro.phase = 'truck';
        hud.bigMessage('PROLOGUE', 'Get in Rico\'s pickup', 3);
        game.setWaypoint?.(truck.pos.x, truck.pos.z, 'Rico\'s pickup');
      }
      return '';
    }
    if (pro.phase === 'truck') {
      // Rico heads for the passenger door as soon as you go for the truck
      if (!ride.st && truck && (player.pos.distanceTo(truck.pos) < 14 || S.entering?.v === truck || S.vehicle === truck)) rideStart(truck);
      S.holdCar = S.vehicle === truck && ride.st !== 'riding';
      if (S.vehicle === truck && ride.st !== 'riding') return 'Wait for Rico to get in';
      if (S.vehicle === truck && ride.st === 'riding') {
        S.holdCar = false;
        pro.phase = 'drive'; pro.t = 0; pro.lineT = 3;
        const d = CITY.downtown;
        const r = nearestRoad(graph, d[0], d[1]) || { x: d[0], z: d[1] };
        pro.dest = { x: r.x, z: r.z };
        game.setWaypoint?.(r.x, r.z, 'Drop Rico downtown');
        rideSay('Downtown. And mind the potholes, my back is not what it was.', 4);
      }
      return S.mode === 'foot' ? 'Get in Rico\'s pickup' : '';
    }
    if (pro.phase === 'drive') {
      const RIDE = ['You know what I like about you, John? You don\'t ask questions. Don\'t start now.', 'See that billboard? I\'m gonna be on one of those someday. Wanted poster, probably.',
        'First rule of the Gulf Line: get paid. Second rule: see rule one.', 'Is that smell the truck or you? ...It\'s the truck. I hope.', 'Cops in this city are bored. Don\'t give them anything to do.'];
      if ((pro.lineT -= dt) <= 0 && pro.said !== RIDE.length) { pro.said = (pro.said || 0); rideSay(RIDE[pro.said], 5); pro.said++; pro.lineT = 14; }
      const v = S.vehicle;
      if (v && Math.hypot(v.pos.x - pro.dest.x, v.pos.z - pro.dest.z) < 40 && Math.abs(v.speed) < 3) {
        rideSay('This is me. Here\'s two hundred for the ride. Now get a gun, get a job, get a car. In that order. Leave the truck, Wrench picks her up.', 7);
        hud.bigMessage('PROLOGUE COMPLETE', 'You have almost nothing. Buy what you need · +$200', 5);
        S.money += 200;
        P.story.prologue = true; career.save();
        // Rico climbs out and walks off; the truck stays at the curb until Wrench collects it
        ride.st = 'out'; ride.t = 0;
        leftTruck = truck;
        game.setWaypoint?.(game.gunShops?.[0]?.x ?? player.pos.x, game.gunShops?.[0]?.z ?? player.pos.z, 'Calvera Arms Exchange (gunsmith)');
        pro = null;
      }
      return '';
    }
    return '';
  }
  // scripted camera during the introductions
  function prologueCamera(camera) {
    if (!pro || pro.phase !== 'intro') return;
    const sh = SHOTS[Math.max(0, pro.shot)];
    if (!sh) return;
    let acc = 0;
    for (let i = 0; i < pro.shot; i++) acc += SHOTS[i].t;
    const k = Math.min(0.999, (pro.t - acc) / sh.t);
    if (sh.who[0] === 'truck' && truck) {
      const f = truck.pos.clone().add(new THREE.Vector3(0, 1, 0));
      const ang = truck.heading + 0.9 + k * 0.4;
      camera.position.set(f.x + Math.sin(ang) * 7.5, f.y + 1.4, f.z + Math.cos(ang) * 7.5);
      camera.lookAt(f);
      return;
    }
    // one close-up per person in this shot, slowly pushing in
    const list = sh.who.filter((w) => typeof w === 'number');
    const n = list.length, i = Math.min(n - 1, Math.floor(k * n)), m = crew[list[i]];
    if (pro.capFor !== m) { pro.capFor = m; caption(m.M.name, m.M.role); }
    const sub = k * n - i;
    const face = m.h.root.rotation.y;
    const head = new THREE.Vector3(m.pos.x, m.pos.y + (m.pose === 'Sitting_Idle_Loop' ? 1.15 : 1.58) * m.M.h, m.pos.z);
    const ang = face + 0.35 - sub * 0.2, dist = 2.3 - sub * 0.35;
    camera.position.set(head.x + Math.sin(ang) * dist, head.y + 0.08, head.z + Math.cos(ang) * dist);
    camera.lookAt(head.x, head.y - 0.05, head.z);
  }

  game.storyBusy = () => !!pro && pro.phase === 'intro';
  if (!P.story.prologue && !skip) setTimeout(startPrologue, 50);
  // no free gun: buy the Standard 9mm from a gunsmith

  const _f = new THREE.Vector3();
  return {
    crew, HQ, local, groundY, svc, say,
    get talkWith() { return talkWith; },
    get busy() { return !!pro && pro.phase === 'intro'; },
    camera: prologueCamera,
    startPrologue,
    update(dt, a) {
      // fire flicker
      const night = game.sky.night;
      fire.intensity = (6 + Math.sin(performance.now() * 0.013) * 1.5 + Math.random() * 1.2) * (0.3 + night * 0.9);
      flameMat.uniforms.uTime.value += dt;
      ember.lookAt(game.camera.position.x, ember.position.y, game.camera.position.z);
      // crew: turn to look at you when you're close, accessories follow heads
      const near = me().distanceTo(_f.set(HQ.x, me().y, HQ.z)) < 70;
      if (ride.st) rideUpdate(dt);
      // Wrench collects Rico's truck once you're well away from it
      if (leftTruck && S.vehicle !== leftTruck && me().distanceTo(leftTruck.pos) > 140) {
        const t = leftTruck; leftTruck = null; scene.remove(t.group); const i = game.parked.indexOf(t); if (i >= 0) game.parked.splice(i, 1); if (truck === t) truck = null;
      }
      for (const m of crew) {
        if (m === rico && ride.st) continue;
        m.h.root.visible = near && !m.away; // away on a crew job, an errand, asleep or locked up (systems/crew.js)
        if (!m.h.root.visible) continue;
        const dx = player.pos.x - m.pos.x, dz = player.pos.z - m.pos.z, d = Math.hypot(dx, dz);
        // (in a fight at the hideout, systems/defense.js turns them toward the threat and poses the gun)
        const want = m.fightHeading != null ? m.fightHeading : d < 6 && m.pose !== 'Sitting_Idle_Loop' ? Math.atan2(dx, dz) : m.look;
        m.h.root.rotation.y += wrapAngle(want - m.h.root.rotation.y) * Math.min(1, dt * (m.fightHeading != null ? 8 : 3));
        if (m.talkT > 0) { m.talkT -= dt; if (m.pose !== 'Sitting_Idle_Loop') m.h.play(m.talkT > 0 ? 'Idle_Talking_Loop' : m.pose || 'Idle_Loop', 0.3); } // (A2) talking with their hands
        m.h.update(dt);
        placeAccessories(m.h);
        if (m.fight) m.fight(dt);
      }
      return pro ? updatePrologue(dt, a) : '';
    },
  };
}
