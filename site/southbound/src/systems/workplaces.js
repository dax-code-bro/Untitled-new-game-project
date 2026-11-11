// F15 Real workplaces and careers. Every job has an employer: a company with a building you walk into
// (or a site office out in the country) and a manager standing there you talk to.
//  - Ask for a job: everyone starts at the bottom of that trade's ladder (Trainee, Probie, Cadet,
//    Apprentice, Deckhand...) and works up; each rank pays more (up to ~1.9x), the top rank adds a salary
//  - A schedule: three shifts a week at set times, texted to you, on the roster board inside and in the
//    phone's Work tab; a reminder two hours before, the GPS set half an hour before
//  - Clock in on time (up to 15 minutes late) at the manager or the punch clock; later is a warning; not
//    turning up is a warning (twice in a row and you're out); walking off a shift or wrecking the company
//    vehicle is a warning; three warnings and you're fired (and can't come back for a week). Four good
//    shifts in a row take a warning off. Call in sick from the phone before a shift (once a week is fine)
//  - Promotions: enough good shifts at a rank with a clean record and the manager moves you up
//  - The manager notices how you turn up: covered in blood, wanted by the police, a gun out
//  - The barbershops are real shops: chairs, mirrors, a sink, a waiting bench and the manager at the
//    till; buy a cut, buy products, or work there: a trainee sweeps, shampoos, folds towels and makes
//    change at the till; a barber cuts what the customer asks for. Make it to the top and buy the shop
//  - The bike messenger works out of a courier depot: punch in, grab a bag, run envelopes between real
//    office doors downtown (pick up here, deliver there)
import * as THREE from 'three';
import { Human } from '../entities/human.js';
import { CITY } from '../world/layout.js';
import { keyHint, money, nearestRoad } from './world-util.js';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const PAY = [1, 1.12, 1.25, 1.42, 1.62, 1.9];
const NEED = [2, 3, 4, 5, 6]; // good shifts at a rank before the next one
const LADDERS = {
  std: ['Trainee', 'Junior', 'Regular', 'Senior', 'Lead', 'Manager'],
  barber: ['Trainee', 'Apprentice barber', 'Barber', 'Senior barber', 'Head barber', 'Shop manager'],
  courier: ['Trainee rider', 'Rider', 'Senior rider', 'Lead rider', 'Dispatcher', 'Depot manager'],
  police: ['Cadet', 'Officer', 'Senior officer', 'Corporal', 'Sergeant', 'Lieutenant'],
  fire: ['Probie', 'Firefighter', 'Engineer', 'Lieutenant', 'Captain', 'Battalion chief'],
  ems: ['EMT trainee', 'EMT', 'Paramedic', 'Senior paramedic', 'Crew chief', 'EMS supervisor'],
  pilot: ['Trainee pilot', 'First officer', 'Pilot', 'Senior pilot', 'Chief pilot', 'Director of flight ops'],
  trade: ['Apprentice', 'Helper', 'Journeyman', 'Senior journeyman', 'Foreman', 'Superintendent'],
  boat: ['Deckhand', 'Mate', 'Skipper', 'Captain', 'Senior captain', 'Fleet captain'],
  ranch: ['Hand', 'Wrangler', 'Top hand', 'Cow boss', 'Foreman', 'Ranch manager'],
};
// job id: [company, the boss's title, ladder, shift start hours (null: contracts), open hours, office theme, where]
// where: 'civic' (the boss waits outside the hospital/fire station/precinct), 'site' (a site office out of town)
const CO = {
  taxi: ['Gulf Cab Co.', 'dispatcher', 'std', [7, 15, 21], 'all', 'garage'],
  bus: ['Calvera Transit', 'route supervisor', 'std', [6, 14], [5, 22], 'garage'],
  parcel: ['Bayou Parcel Service', 'shift manager', 'std', [8, 12], [7, 19], 'parcels'],
  pizza: ['Mama Rosa\'s Pizza', 'manager', 'std', [11, 17], [10, 23], 'pizza'],
  trucker: ['Gulf Freight Lines', 'dispatcher', 'std', [6, 13], [5, 20], 'parcels'],
  paramedic: ['Calvera EMS', 'shift supervisor', 'ems', [7, 19], 'all', 'medical', 'civic'],
  fire: ['Calvera Fire Department', 'captain', 'fire', [7, 19], 'all', 'fire', 'civic'],
  police: ['Port Calvera Police', 'watch sergeant', 'police', [7, 15, 23], 'all', 'police', 'civic'],
  tow: ['Big Dave\'s Towing', 'owner', 'std', [8, 16], [6, 22], 'garage'],
  garbage: ['Calvera Sanitation', 'route foreman', 'std', [5, 6], [4, 15], 'hardhat'],
  roadcrew: ['Parish Roads Department', 'foreman', 'trade', [7], [6, 17], 'hardhat'],
  mechanic: ['Mill Creek Garage', 'shop foreman', 'trade', [8, 12], [7, 18], 'garage'],
  messenger: ['Pelican Courier Co.', 'dispatcher', 'courier', [8, 12], [7, 19], 'courier'],
  paper: ['The Calvera Courier', 'circulation manager', 'courier', [5, 14], [4, 18], 'parcels'],
  security: ['Ironclad Security', 'site supervisor', 'std', [20, 22], 'all', 'police'],
  charter: ['Lake Arden Charters', 'owner', 'boat', [6, 13], [5, 19], 'boat', 'site'],
  fisherman: ['Bayou Seafood Co-op', 'dock boss', 'boat', [5, 6], [4, 16], 'boat', 'site'],
  guide: ['Bayou Verde Outfitters', 'head guide', 'std', [6, 15], [5, 19], 'boat', 'site'],
  duster: ['Delta Ag Aviation', 'chief pilot', 'pilot', [7], [6, 18], 'hangar', 'site'],
  tours: ['Gulf Air Tours', 'operations manager', 'pilot', [10, 14], [8, 19], 'hangar', 'site'],
  medevac: ['LifeFlight Gulf', 'flight lead', 'pilot', [8, 20], 'all', 'medical', 'site'],
  lumber: ['Cypress Timber Co.', 'logging boss', 'trade', [7], [6, 17], 'hardhat', 'site'],
  landscaper: ['Green Acres Lawn & Garden', 'crew leader', 'trade', [8], [7, 18], 'hardhat'],
  construction: ['Delacroix Construction', 'site foreman', 'trade', [7], [6, 17], 'hardhat'],
  electrician: ['Bright Spark Electric', 'master electrician', 'trade', [8], [7, 18], 'hardhat'],
  plumber: ['Gulf Plumbing & Drain', 'master plumber', 'trade', [8], [7, 18], 'hardhat'],
  ranch: ['Double R Ranch', 'foreman', 'ranch', [6], [5, 19], 'ranch', 'site'],
  bounty: ['Parish Bail Bonds', 'bondsman', 'std', null, 'all', 'police', 'civic'],
};
const SHOPS = [
  { id: 'barber_city', boss: 'Earl "Slick" Dupree', first: 'Slick', title: 'owner', price: 65000, take: 260 },
  { id: 'barber_town', boss: 'Odette Fontenot', first: 'Odette', title: 'manager', price: 38000, take: 150 },
];
const FIRST = ['Earl', 'Dolores', 'Rene', 'Marisol', 'Clint', 'Yvette', 'Darnell', 'Lucille', 'Hector', 'Bernadette', 'Floyd', 'Tamika', 'Gus', 'Odette', 'Ray', 'Celeste', 'Wendell', 'Paulette', 'Arturo', 'Kendra', 'Mavis', 'Thad', 'Rosalind', 'Deacon', 'June', 'Cyrus', 'Inez', 'Royce', 'Opal', 'Lionel'];
const LAST = ['Thibodeaux', 'Landry', 'Guidry', 'Broussard', 'Hebert', 'Fontenot', 'Mouton', 'Delahoussaye', 'Washington', 'Reyes', 'Castille', 'Batiste', 'LeBlanc', 'Arceneaux', 'Duhon', 'Savoie', 'Fuselier', 'Prejean', 'Romero', 'Benoit', 'Trahan', 'Comeaux', 'Doucet', 'Melancon', 'Boudreaux', 'Picard', 'Ardoin', 'Guillory', 'Sonnier', 'Hidalgo'];
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const pickR = (a) => a[(Math.random() * a.length) | 0];
const hh = (h) => { h = ((h % 24) + 24) % 24; const H = Math.floor(h), m = Math.round((h - H) * 60); return `${H % 12 || 12}${m ? ':' + String(m).padStart(2, '0') : ''} ${H < 12 ? 'AM' : 'PM'}`; };
const cap = (s) => s[0].toUpperCase() + s.slice(1);

// what a barber can be asked for (rank: from which rank you get asked)
const STYLES = [
  { id: 'short', rank: 1, price: 25, label: 'Scissors: short back and sides', lines: ['Short back and sides, please.', 'Just a regular cut. Nothing fancy.', 'Tidy it up, keep it short on the sides.'] },
  { id: 'buzz', rank: 1, price: 20, label: 'Clippers: number two all over', lines: ['Number two all over.', 'Buzz it. It\'s too hot for hair.', 'Clippers, all the same length, short.'] },
  { id: 'slick', rank: 2, price: 30, label: 'Trim and comb it back with pomade', lines: ['Slick it back, I\'ve got a date.', 'Something sharp. Combed back.', 'Make me look like money.'] },
  { id: 'shaved', rank: 2, price: 25, label: 'Razor: shave the head smooth', lines: ['Take it all off. Smooth.', 'Shave my head. I\'m done with it.'] },
  { id: 'trim', rank: 3, price: 12, label: 'Trim and shape the beard', lines: ['Tidy up the beard, it\'s getting wild.', 'Just shape the beard, leave the hair.'] },
  { id: 'shave', rank: 3, price: 15, label: 'Hot towel and straight-razor shave', lines: ['Hot towel shave, please.', 'A proper shave. Clean.'] },
  { id: 'dye', rank: 3, price: 30, label: 'Colour: dye it black', lines: ['Can you take the grey out? Black.', 'Dye it black. Don\'t tell my wife.'] },
];
const ANGRY = ['That\'s not what I asked for!', 'Are you kidding me? Look at this!', 'I said something else entirely.', 'My wife is going to kill me.'];
const FIRED_LINES = ['You\'ve got some nerve showing your face here.', 'We\'re not hiring. Not you, anyway.', 'Security will walk you out if you don\'t go.'];

// ---- canvas signs
function signTex(text, sub, { w = 512, h = 128, bg = '#1d2b3a', fg = '#f3ecd8' } = {}) {
  const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = bg; x.fillRect(0, 0, w, h);
  x.strokeStyle = fg; x.lineWidth = 4; x.strokeRect(8, 8, w - 16, h - 16);
  x.fillStyle = fg; x.textAlign = 'center'; x.textBaseline = 'middle';
  let size = 54; x.font = `bold ${size}px Georgia, serif`;
  while (x.measureText(text).width > w - 50 && size > 18) { size -= 2; x.font = `bold ${size}px Georgia, serif`; }
  x.fillText(text, w / 2, sub ? h * 0.4 : h / 2);
  if (sub) { x.font = `${Math.round(h * 0.17)}px Arial, sans-serif`; x.fillText(sub, w / 2, h * 0.76); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}
const tile = (draw, rep) => { const c = document.createElement('canvas'); c.width = c.height = 128; draw(c.getContext('2d')); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); t.anisotropy = 4; return t; };
// a tube between two points (bike frames)
const _a = new THREE.Vector3(), _b = new THREE.Vector3();
function tube(g, a, b, r, mat) {
  _a.set(...a); _b.set(...b);
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, _a.distanceTo(_b), 8), mat);
  m.position.copy(_a).add(_b).multiplyScalar(0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), _b.clone().sub(_a).normalize());
  g.add(m); return m;
}
function bicycle(colour) {
  const g = new THREE.Group(), black = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }), paint = new THREE.MeshStandardMaterial({ color: colour, roughness: 0.35, metalness: 0.4 }), steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, roughness: 0.3, metalness: 0.9 });
  for (const x of [-0.52, 0.52]) { const w = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.022, 8, 28), black); w.position.set(x, 0.35, 0); g.add(w); const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), steel); hub.rotation.x = Math.PI / 2; hub.position.set(x, 0.35, 0); g.add(hub); }
  const bb = [0, 0.33, 0], seat = [-0.18, 0.86, 0], head = [0.4, 0.86, 0];
  tube(g, bb, seat, 0.017, paint); tube(g, bb, head, 0.02, paint); tube(g, seat, head, 0.016, paint);
  tube(g, bb, [-0.52, 0.35, 0.04], 0.011, paint); tube(g, bb, [-0.52, 0.35, -0.04], 0.011, paint);
  tube(g, seat, [-0.52, 0.35, 0.04], 0.01, paint); tube(g, seat, [-0.52, 0.35, -0.04], 0.01, paint);
  tube(g, head, [0.52, 0.35, 0], 0.014, steel);
  tube(g, head, [0.38, 1.0, 0], 0.014, steel); tube(g, [0.38, 1.0, -0.24], [0.38, 1.0, 0.24], 0.012, black);
  const sad = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.12), black); sad.position.set(-0.2, 0.92, 0); g.add(sad);
  tube(g, [-0.19, 0.86, 0], [-0.2, 0.9, 0], 0.012, steel);
  return g;
}
function barberChair(M) {
  const g = new THREE.Group(), chrome = M(0xd8dade, 0.22, 1), red = M(0x7a1414, 0.42);
  const add = (geo, mat, x, y, z, rx = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; g.add(m); return m; };
  add(new THREE.CylinderGeometry(0.28, 0.32, 0.06, 24), chrome, 0, 0.03, 0);
  add(new THREE.CylinderGeometry(0.07, 0.09, 0.36, 12), chrome, 0, 0.24, 0);
  add(new THREE.BoxGeometry(0.6, 0.05, 0.56), chrome, 0, 0.42, 0);
  add(new THREE.BoxGeometry(0.56, 0.12, 0.52), red, 0, 0.5, 0);
  add(new THREE.BoxGeometry(0.56, 0.64, 0.1), red, 0, 0.86, 0.27, -0.14);
  add(new THREE.BoxGeometry(0.3, 0.16, 0.08), red, 0, 1.26, 0.33, -0.14);
  for (const s of [-1, 1]) { add(new THREE.BoxGeometry(0.08, 0.06, 0.46), red, s * 0.32, 0.7, 0.02); add(new THREE.BoxGeometry(0.035, 0.2, 0.035), chrome, s * 0.32, 0.58, -0.16); }
  add(new THREE.BoxGeometry(0.44, 0.03, 0.18), chrome, 0, 0.16, -0.44);
  add(new THREE.BoxGeometry(0.04, 0.04, 0.34), chrome, 0, 0.3, -0.3, 0.7);
  return g;
}
function hairDecal() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
  for (let i = 0; i < 260; i++) { const a = Math.random() * 6.28, d = Math.random() * 54, px = 64 + Math.cos(a) * d, py = 64 + Math.sin(a) * d, b = Math.random() * 6.28, l = 3 + Math.random() * 7; x.strokeStyle = `rgba(${[30, 26, 22][i % 3]},${20 + (i % 5) * 3},14,${0.5 + Math.random() * 0.4})`; x.lineWidth = 1 + Math.random(); x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(b) * l, py + Math.sin(b) * l); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), new THREE.MeshStandardMaterial({ map: t, transparent: true, depthWrite: false, roughness: 0.9 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1;
  return m;
}

export function installWorkplaces(game) {
  let api = null;
  const sys = {
    get ready() { return !!api; },
    // what jobs.js and the tests may call before everything it needs exists
    boardLabel: (def) => api?.boardLabel(def) || null,
    talk: (id) => api?.talk(id),
    payMult: (id) => api ? api.payMult(id) : 1,
    sharp: () => !!api?.sharp(),
    shiftEnded: (id, ok, info) => api?.shiftEnded(id, ok, info),
    officeStops: (n, from) => api?.officeStops(n, from) || null,
    update(dt) { if (!api) { if (game.estate && game.jobs && game.barberSpots && game.lib?.peopleIds && game.openDialog) { api = build(game); Object.defineProperties(sys, Object.getOwnPropertyDescriptors(api.expose)); } return ''; } return api.update(dt); },
  };
  return sys;
}

function build(game) {
  const { career, hud, interact, scene, collision, hm, player, sky, estate, jobs } = game;
  const P = career.p;
  P.employ = P.employ || {}; P.kit = P.kit || {}; P.ownBiz = P.ownBiz || {};
  const now = () => sky.day * 24 + sky.hour;
  const fmt = (t) => `${DAYS[((Math.floor(t / 24) % 7) + 7) % 7]} ${hh(t % 24)}`;
  const toast = (m, s = 2.6) => hud.toast(m, s);
  const text = (E, body) => game.text?.(`${E.boss.name} (${E.name})`, body);
  const looks = game.lib.peopleIds;

  // ---------------- the employers ----------------
  const employers = new Map();
  const mkBoss = (id, name, first, title) => { const h = hash(id); const f = first || FIRST[(h >>> 13) % FIRST.length]; return { name: name || `${f} ${LAST[(h >>> 8) % LAST.length]}`, first: f, title, look: (h >>> 4) % looks.length }; };
  for (const def of jobs.JOBS) {
    const c = CO[def.id]; if (!c) continue;
    const E = { id: def.id, kind: 'job', job: def, name: c[0], ladder: LADDERS[c[2]], starts: c[3], open: c[4], theme: c[5], where: c[6] || 'town', perWeek: 3, boss: mkBoss(def.id, null, null, c[1]), board: def.board };
    E.salary = Math.round(def.pay * (def.stops || def.need || 1) * 0.6);
    E.cap = () => (c[2] === 'pilot' && !P.pilotLicence ? 0 : 5);
    employers.set(E.id, E);
  }
  for (let k = 0; k < SHOPS.length && k < game.barberSpots.length; k++) {
    const s = SHOPS[k], spot = game.barberSpots[k];
    employers.set(s.id, { id: s.id, kind: 'barber', job: null, name: spot.name, ladder: LADDERS.barber, starts: [9, 13], open: [9, 19], theme: 'barber', where: 'town', perWeek: 3, boss: mkBoss(s.id, s.boss, s.first, s.title), price: s.price, take: s.take, salary: 120, spot, cap: () => 5 });
  }
  for (const E of employers.values()) {
    E.isOpen = () => E.open === 'all' || (sky.hour >= E.open[0] && sky.hour < E.open[1]);
    E.boss.titleCap = cap(E.boss.title);
  }

  // ---------------- records ----------------
  const emp = (id) => (P.employ[id] && P.employ[id].hired != null && P.employ[id].hired !== false ? P.employ[id] : null);
  const firedFrom = (id) => { const r = P.employ[id]; return r && r.hired === false && r.firedUntil > sky.day ? r : null; };
  const payMult = (id) => { const e = emp(id); return e ? PAY[e.rank] : 1; };
  const sharp = () => (P.kit.sharpUntil || 0) > now();
  game.onGroomed = () => { P.kit.sharpUntil = now() + 72; };

  function plan(E, e) {
    if (!E.starts) { e.sched = []; return; }
    if (P.ownBiz[E.id]) { e.sched = e.sched.filter((s) => s.st !== 'due'); return; }
    const t = now();
    e.sched = e.sched.filter((s) => s.t > t - 48 || s.st === 'due');
    const ahead = e.sched.filter((s) => s.st === 'due' && s.t > t);
    if (ahead.length >= 2) return;
    const lastDay = e.sched.length ? Math.floor(e.sched[e.sched.length - 1].t / 24) : sky.day;
    const from = Math.max(sky.day + 1, lastDay + 1), days = [];
    for (let k = 0; k < 7; k++) days.push(from + k);
    for (let k = days.length - 1; k > 0; k--) { const j = (Math.random() * (k + 1)) | 0; [days[k], days[j]] = [days[j], days[k]]; }
    for (const d of days.slice(0, E.perWeek).sort((a, b) => a - b)) e.sched.push({ t: d * 24 + pickR(E.starts), st: 'due' });
  }
  const upcoming = (e) => e.sched.filter((s) => s.st === 'due' && s.t > now() - 2).sort((a, b) => a.t - b.t);
  const current = (E, e) => e && e.sched.find((s) => s.st === 'due' && now() >= s.t - 1 && now() <= s.t + 2);

  function hire(E, offerTrial = true) {
    if (emp(E.id)) return emp(E.id);
    if (firedFrom(E.id)) { toast(`${E.boss.first}: "${pickR(FIRED_LINES)}"`); return null; }
    if (game.police?.wanted > 0) { toast(`${E.boss.first}: "Not while the police are looking for you. Come back with a clean slate."`, 3); return null; }
    const e = P.employ[E.id] = { hired: sky.day, rank: 0, atRank: 0, shifts: 0, good: 0, warn: 0, missedRow: 0, streak: 0, recent: [], sched: [], sick: [], since: sky.day };
    plan(E, e);
    const next = upcoming(e).slice(0, 3).map((s) => fmt(s.t)).join(', ');
    hud.bigMessage('HIRED', `${E.name} · ${E.ladder[0]}`, 3);
    text(E, E.starts ? `Welcome aboard. You start as ${E.ladder[0].toLowerCase()}. Your shifts: ${next}. Clock in on time: late is a warning, a no-show is a warning, three and you're out.` : 'Welcome aboard. Come by when you want a contract.');
    career.saveSoon();
    if (offerTrial && E.isOpen()) game.openDialog(`${E.boss.name} · ${E.name}`, E.starts ? `You're hired. Your shifts are on the roster (${next}). Want to work a trial shift right now?` : 'You\'re on the books. Want a contract now?', [
      [E.starts ? 'Start a trial shift now' : 'Take a contract', () => begin(E, e, null)],
      ['Later', () => {}],
    ]);
    return e;
  }
  function fire(E, e, why) {
    if (cur && cur.E === E && shop?.shift) endShop(false, null, true);
    if (cur && cur.E === E) cur = null;
    P.employ[E.id] = { hired: false, firedUntil: sky.day + 7, was: e.rank, shifts: e.shifts };
    hud.bigMessage('FIRED', `${E.name} · ${why}`, 3.5);
    text(E, `${why}. That's three. Clean out your locker; you're done here. Don't come back for a week.`);
    career.saveSoon();
  }
  function warn(E, e, why, now2 = false) {
    e.warn++; e.streak = 0;
    if (now2 || e.warn >= 3) { fire(E, e, why); return true; }
    toast(`⚠ ${E.name}: ${why}. Warning ${e.warn} of 3.`, 3.2);
    text(E, `${why}. That's a warning (${e.warn} of 3).`);
    return false;
  }
  function quit(E) {
    if (cur && cur.E === E) { if (shop?.shift) endShop(false, null, true); cur = null; }
    delete P.employ[E.id];
    toast(`You hand in your notice. ${E.boss.first}: "Good luck out there."`, 3);
    career.saveSoon();
  }
  function promoteCheck(E, e) {
    if (e.rank >= 5 || e.rank >= E.cap()) {
      if (e.rank < 5 && e.atRank >= NEED[e.rank] && !e.capNote) { e.capNote = true; text(E, 'You\'ve earned a step up, but I can\'t make you a pilot without a licence. Get one at the flight school.'); }
      return;
    }
    const avg = e.recent.length ? e.recent.reduce((a, b) => a + b, 0) / e.recent.length : 0;
    if (e.atRank < NEED[e.rank]) return;
    if (e.warn > 0 || avg < 3.5) { if (!e.holdNote) { e.holdNote = true; text(E, e.warn > 0 ? 'Keep your record clean and there\'s a promotion in it for you.' : 'You\'re putting in the shifts. Do them better and we\'ll talk about a promotion.'); } return; }
    e.rank++; e.atRank = 0; e.holdNote = false;
    hud.bigMessage('PROMOTED', `${E.name} · ${E.ladder[e.rank]} · pay +${Math.round((PAY[e.rank] - 1) * 100)}%`, 3.5);
    text(E, `Good work lately. You're ${E.ladder[e.rank].toLowerCase()} now${e.rank === 5 ? ', with a salary on top' : ''}.`);
    if (E.kind === 'barber' && e.rank === 5) text(E, `I'm getting too old for this. If you ever want the shop, it's yours for ${money(E.price)}.`);
  }

  // ---------------- turning up ----------------
  // why the manager won't put you on right now (null: fine)
  const blocker = (E) => {
    if (game.police?.wanted > 0) return E.id === 'police' ? 'You\'re wanted. You\'re suspended until that\'s cleared up.' : 'The police were just here asking about you. Not today.';
    if ((P.grime?.blood || 0) > 0.35) return 'Whoa. Whose blood is that? You can\'t work like that. Go clean up.';
    if (game.combat && game.combat.holstered === false) return 'Put that gun away before you talk to me.';
    return null;
  };
  let cur = null; // the shift you're on: { E, s }
  function begin(E, e, s) {
    const no = blocker(E);
    if (no) { toast(`${E.boss.first}: "${no}"`, 3.2); return false; }
    if (jobs.active) { toast('Finish the shift you\'re on first.', 2.4); return false; }
    if ((game.needs?.N?.energy ?? 100) < 12) toast(`${E.boss.first}: "You look dead on your feet. Try not to fall asleep."`, 2.6);
    if ((P.grime?.dirt || 0) > 0.6) toast(`${E.boss.first}: "You're filthy. At least wash your hands."`, 2.4);
    cur = { E, s };
    if (E.kind === 'barber') {
      if (!E.door) { cur = null; toast(`${E.boss.first}: "Nothing for you today."`, 2.2); return false; }
      const go = () => { if (shop && shop.E === E) shopStart(E, s); else cur = null; };
      if (estate.inside?.d === E.door) go(); else { if (estate.inside) estate.leave(); const p = estate.enter(E.door); if (p && p.then) p.then(go); else go(); }
      return true;
    }
    if (E.id === 'messenger' && estate.inside?.d === E.door) { E.bagReady = true; toast(`${E.boss.first}: "Grab a bag off the hook by the door and get moving."`, 3); return true; }
    if (estate.inside) estate.leave();
    jobs.start(E.id, { work: true, sched: s });
    if (!jobs.active) { cur = null; return false; }
    return true;
  }
  function clockIn(E, e, s) {
    if (blocker(E)) return begin(E, e, s);
    const late = now() - s.t > 0.25;
    s.st = late ? 'late' : 'in';
    e.missedRow = 0;
    if (late) { if (warn(E, e, `Late for your ${fmt(s.t)} shift (${Math.round((now() - s.t) * 60)} min)`)) return false; }
    else toast(`${E.boss.first}: "${pickR(['Right on time.', 'Morning. Let\'s get to it.', 'Good, you\'re here.'])}"`, 2);
    return begin(E, e, s);
  }
  function callSick(E, e) {
    const s = upcoming(e).find((x) => x.t > now());
    if (!s || s.t - now() > 24) { toast('No shift in the next day to call in for.', 2.2); return; }
    s.st = 'sick';
    const hurt = player.health < 60 || (game.medical?.ill?.() ?? false);
    const recent = e.sick.filter((d) => d > sky.day - 7).length;
    e.sick.push(sky.day);
    if (hurt) text(E, 'You sound awful. Stay home, get better.');
    else if (recent >= 1) warn(E, e, 'Calling in sick again this week');
    else text(E, `Alright. Feel better. We'll cover your ${fmt(s.t)}.`);
    plan(E, e); career.saveSoon();
  }
  function shiftEnded(id, ok, info = {}) {
    if (!cur || cur.E.id !== id) return;
    const { E, s } = cur; cur = null;
    const e = emp(id); if (!e) return;
    if (ok) {
      e.shifts++; e.atRank++; e.streak++;
      e.recent.push(info.rating ?? 4); if (e.recent.length > 5) e.recent.shift();
      if ((info.rating ?? 4) >= 4) e.good++;
      if (s) s.st = s.st === 'late' ? 'late-done' : 'done';
      if (e.streak >= 4 && e.warn > 0) { e.warn--; e.streak = 0; text(E, 'Four good shifts in a row. I\'m taking a warning off your record.'); }
      promoteCheck(E, e);
    } else if (info.wrecked) warn(E, e, 'You wrecked the company vehicle');
    else if (s) { s.st = 'failed'; warn(E, e, 'You walked off your shift'); }
    career.saveSoon();
  }

  // ---------------- the dialog ----------------
  function products(E) {
    const buy = (price, name, fn) => [`${name} · $${price}`, () => { if (!career.spend(price)) return; fn(); career.saveSoon(); }];
    game.openDialog(`${E.boss.name} · ${E.name}`, 'Everything a man needs to look like he means it.', [
      buy(9, 'Pomade (looks sharp for 3 days: better tips)', () => { P.kit.sharpUntil = now() + 72; P.kit.pomade = (P.kit.pomade || 0) + 1; toast('Pomade: a sharp look. People tip better.', 2.4); }),
      buy(11, 'Aftershave (smells sharp for a day)', () => { P.kit.sharpUntil = Math.max(P.kit.sharpUntil || 0, now() + 24); toast('A splash of aftershave. You smell like money.', 2.4); }),
      buy(14, 'Beard oil (fuller beard)', () => { if (P.groom) P.groom.beard = Math.min(10, (P.groom.beard || 0) + 2); game.groom?.apply(); toast('Beard oil: it fills in nicely.', 2.2); }),
      buy(60, 'Grooming kit (clippers + razor: trim yourself at home or the hideout)', () => { P.kit.clippers = true; toast('Clippers and a razor: you can trim yourself at home now.', 2.6); }),
      ['Never mind.', () => {}],
    ]);
  }
  function scheduleToast(E, e) {
    const list = upcoming(e).slice(0, 4).map((s) => fmt(s.t));
    toast(E.starts ? `${E.name}: ${list.length ? list.join(' · ') : 'nothing on the roster yet'}${e.warn ? ` · warnings ${e.warn}/3` : ''}` : `${E.name}: contracts whenever you want one.`, 4);
  }
  function talk(id) {
    const E = employers.get(id); if (!E) return;
    const e = emp(id), who = `${E.boss.name} · ${E.boss.titleCap}, ${E.name}`, opts = [];
    if (firedFrom(id)) return game.openDialog(who, pickR(FIRED_LINES), [...(E.kind === 'barber' ? [['Just a haircut. Please.', () => game.barberChair?.('Fine. Sit down and don\'t talk.')]] : []), ['Leave.', () => {}]]);
    if (E.kind === 'barber') {
      opts.push(['Get a haircut or a shave', () => game.barberChair?.()]);
      opts.push(['Buy something (pomade, aftershave, oil, grooming kit)', () => products(E)]);
    }
    if (!e) {
      if (E.isOpen()) opts.push([`Ask for a job (you'd start as ${E.ladder[0].toLowerCase()})`, () => hire(E, true)]);
    } else {
      const s = current(E, e);
      if (s) opts.push([`Clock in for your ${fmt(s.t)} shift${now() > s.t + 0.25 ? ' (late!)' : ''}`, () => clockIn(E, e, s)]);
      else if (P.ownBiz[id]) opts.push(['Work the chair (your shop: you keep it all)', () => begin(E, e, null)]);
      else if (E.isOpen()) opts.push([E.starts ? 'Pick up an extra shift' : 'Take a contract', () => begin(E, e, null)]);
      if (E.starts && !P.ownBiz[id]) opts.push(['When am I working?', () => scheduleToast(E, e)]);
      if (E.kind === 'barber' && e.rank >= 5 && !P.ownBiz[id]) opts.push([`Buy the shop · ${money(E.price)}`, () => buyShop(E)]);
      if (!P.ownBiz[id]) opts.push(['Hand in your notice', () => quit(E)]);
    }
    opts.push(['Never mind.', () => {}]);
    const h = sky.hour, hello = h < 12 ? 'Morning.' : h < 18 ? 'Afternoon.' : 'Evening.';
    const block = blocker(E);
    const line = block || (!e ? (E.isOpen() ? `${hello} ${E.starts ? `We're hiring. ${E.ladder[0]}s start at ${money(E.job ? E.job.pay : 12)} a ${E.job ? 'run' : 'job'}, ${E.perWeek} shifts a week. Show up on time and you'll move up.` : 'Bail jumpers, paid by the head. You in?'}` : `We're closed. Come back at ${hh(E.open[0])}.`)
      : P.ownBiz[id] ? 'Boss. Shop\'s doing fine.' : `${hello} ${E.ladder[e.rank]}${e.warn ? `, and you're on ${e.warn} warning${e.warn > 1 ? 's' : ''}` : ''}. ${upcoming(e)[0] ? `Next shift ${fmt(upcoming(e)[0].t)}.` : ''}`);
    game.openDialog(who, line, opts);
  }
  function buyShop(E) {
    if (!career.spend(E.price)) return;
    P.ownBiz[E.id] = true;
    const e = emp(E.id); if (e) plan(E, e);
    hud.bigMessage('BUSINESS PURCHASED', `${E.name} is yours · takings ~${money(E.take)} a day`, 3.5);
    text(E, 'She\'s all yours. I\'ll keep cutting a few days a week, if the new owner will have me.');
    career.save();
  }

  // ---------------- the places ----------------
  const used = new Set(), homes = new Set((game.population?.town?.residents || []).map((r) => r.home)); // (a house somebody lives in isn't a shop)
  const doorFor = (x, z, maxD, styles = [5, 1, 3]) => {
    let best = null, bd = maxD;
    for (const d of estate.doors) {
      if (used.has(d.i) || estate.special.has(d.i) || estate.isProperty(d.i) || d.b.ruined || !styles.includes(d.b.style) || (d.b.style === 4 && homes.has(d.i))) continue;
      const dist = Math.hypot(d.x - x, d.z - z);
      if (dist < bd) { bd = dist; best = d; }
    }
    return best;
  };
  const wall = (d) => ({ x: d.b.x + d.nx * (d.b.w / 2), z: d.b.z + d.nz * (d.b.d / 2), y: d.b.y ?? collision.surface(d.x, d.z, 60) });
  function facadeSign(E, d) {
    const w = wall(d), m = new THREE.Mesh(new THREE.PlaneGeometry(2.8, 0.6), new THREE.MeshStandardMaterial({ map: signTex(E.name, E.kind === 'barber' ? 'CUTS · SHAVES · SINCE 1961' : E.job ? E.job.name.toUpperCase() + 'S WANTED' : '', { bg: E.kind === 'barber' ? '#7a1414' : '#1d2b3a' }), roughness: 0.5 }));
    m.position.set(w.x + d.nx * 0.09, w.y + 2.75, w.z + d.nz * 0.09); m.rotation.y = Math.atan2(d.nx, d.nz);
    scene.add(m);
  }
  function siteOffice(E, bx, bz) {
    // a site office (a trailer with a sign) by the board, on the flattest dry spot nearby
    let best = null, bs = 1e9;
    for (let k = 0; k < 24; k++) {
      const a = (k % 8) * Math.PI / 4, rr = 9 + Math.floor(k / 8) * 5, x = bx + Math.cos(a) * rr, z = bz + Math.sin(a) * rr, y = hm.height(x, z);
      if (y < 0.4 || collision.paved(x, z) !== null) continue;
      const nr = nearestRoad(game.graph, x, z);
      if (nr && nr.dist < (nr.edge.width || 8) / 2 + 4.5) continue;
      let blocked = false; collision.query(x, z, 3.5, (it) => { if (it.t === 0 && it.maxX > x - 3 && it.minX < x + 3 && it.maxZ > z - 3 && it.minZ < z + 3) blocked = true; });
      if (blocked) continue;
      const slope = Math.abs(hm.height(x + 2.5, z) - hm.height(x - 2.5, z)) + Math.abs(hm.height(x, z + 2.5) - hm.height(x, z - 2.5));
      if (slope + rr * 0.02 < bs) { bs = slope + rr * 0.02; best = { x, z, y }; }
    }
    if (!best) return null;
    const dx = bx - best.x, dz = bz - best.z, rot = Math.round(Math.atan2(dx, dz) / (Math.PI / 2)) * (Math.PI / 2);
    const g = new THREE.Group(); g.position.set(best.x, best.y, best.z); g.rotation.y = rot;
    const siding = tile((x) => { x.fillStyle = '#e9e6dc'; x.fillRect(0, 0, 128, 128); x.fillStyle = 'rgba(0,0,0,0.12)'; for (let i = 0; i < 128; i += 16) x.fillRect(0, i, 128, 2); }, [3, 2]);
    const body = new THREE.Mesh(new THREE.BoxGeometry(4.4, 2.4, 2.4), new THREE.MeshStandardMaterial({ map: siding, roughness: 0.8 })); body.position.y = 1.6; body.castShadow = body.receiveShadow = true; g.add(body);
    const skirt = new THREE.Mesh(new THREE.BoxGeometry(4.3, 0.4, 2.3), new THREE.MeshStandardMaterial({ color: 0x3a3a38, roughness: 0.9 })); skirt.position.y = 0.2; g.add(skirt);
    const roof = new THREE.Mesh(new THREE.BoxGeometry(4.6, 0.08, 2.6), new THREE.MeshStandardMaterial({ color: 0x8a8d90, roughness: 0.5, metalness: 0.5 })); roof.position.y = 2.84; g.add(roof);
    const door = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 1.95), new THREE.MeshStandardMaterial({ color: 0x5a6670, roughness: 0.5 })); door.position.set(-1.1, 1.4, 1.21); g.add(door);
    const glass = new THREE.MeshStandardMaterial({ color: 0x24323e, roughness: 0.08, metalness: 0.3 });
    for (const x of [0.4, 1.5]) { const w = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.6), glass); w.position.set(x, 1.85, 1.21); g.add(w); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.5), new THREE.MeshStandardMaterial({ map: signTex(E.name, E.job ? E.job.name.toUpperCase() : ''), roughness: 0.5 })); sign.position.set(0.6, 2.45, 1.22); g.add(sign);
    for (let k = 0; k < 2; k++) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.32), new THREE.MeshStandardMaterial({ color: 0x777470, roughness: 0.9 })); st.position.set(-1.1, 0.1 + k * 0.2, 1.4 + (1 - k) * 0.3); g.add(st); }
    scene.add(g);
    const sw = Math.abs(Math.sin(rot)) > 0.5, hx = sw ? 1.2 : 2.2, hz = sw ? 2.2 : 1.2;
    collision.addBox(best.x - hx, best.z - hz, best.x + hx, best.z + hz, best.y, best.y + 2.9);
    // the manager stands out front, between the door and the board
    const f = { x: Math.sin(rot), z: Math.cos(rot) };
    return { x: best.x + f.x * 2.2 + f.z * -1.1, z: best.z + f.z * 2.2 - f.x * -1.1 };
  }
  const moveBoard = (E, x, z) => { if (!E.board) return; E.board.x = x; E.board.z = z; E.board.y = hm.height(x, z); if (E.job) E.job.at = [x, z]; };
  for (const E of employers.values()) {
    if (E.kind === 'barber') {
      const sp = E.spot, d = doorFor(sp.x, sp.z, 160, [5, 1, 3, 2]) || doorFor(sp.x, sp.z, 220, [4]);
      if (!d) { E.outdoor = { x: sp.x + 1.2, z: sp.z + 0.4 }; E.board = sp.point; sp.point.label = () => boardLabel(E); sp.point.use = () => talk(E.id); continue; }
      used.add(d.i); E.door = d;
      const w = wall(d), side = { x: d.nz, z: -d.nx };
      sp.pole.position.set(w.x + d.nx * 0.5 + side.x * 1.4, collision.surface(w.x + d.nx * 0.5, w.z + d.nz * 0.5, w.y + 3), w.z + d.nz * 0.5 + side.z * 1.4);
      interact.remove(sp.point);
      const bx = d.x + d.nx * 1.4, bz = d.z + d.nz * 1.4;
      E.board = interact.add({ x: bx, z: bz, r: 1.5, marker: false, blip: { color: '#d84040', size: 4, global: true, icon: '✂️', badge: 'S' }, show: () => !game.S.indoors, label: () => boardLabel(E), use: () => talk(E.id) });
      sp.x = bx; sp.z = bz;
      facadeSign(E, d);
      continue;
    }
    const [x0, z0] = jobs.where(E.job);
    if (E.where === 'civic') { E.outdoor = { x: x0 + 1.4, z: z0 + 0.6 }; continue; }
    const d = E.where === 'site' ? null : doorFor(x0, z0, 140, E.theme === 'parcels' || E.theme === 'garage' || E.theme === 'hardhat' ? [3, 5, 1] : [5, 1, 3]);
    if (d) { used.add(d.i); E.door = d; moveBoard(E, d.x + d.nx * 1.6, d.z + d.nz * 1.6); facadeSign(E, d); continue; }
    const at = siteOffice(E, x0, z0);
    E.outdoor = at || { x: x0 + 1.4, z: z0 + 0.6 };
    if (at && E.board) { E.board.x = at.x + 0.9; E.board.z = at.z + 0.9; E.board.y = hm.height(E.board.x, E.board.z); if (Array.isArray(E.job.at)) E.job.at = [E.board.x, E.board.z]; }
  }
  // the buildings they run
  for (const E of employers.values()) {
    if (!E.door) continue;
    estate.claim(E.door.i, {
      kind: E.kind === 'barber' ? 'barber' : 'work', name: E.name, size: E.kind === 'barber' ? [9.5, 8.5] : [10.5, 9],
      open: () => E.isOpen() || (cur && cur.E === E) || (emp(E.id) && !!current(E, emp(E.id))) || !!P.ownBiz[E.id],
      furnish: (c) => { E.o = c.o; E.L = E.kind === 'barber' ? furnishBarber(c) : furnishOffice(c, E); },
      enter: (c) => (E.kind === 'barber' ? enterBarber(E, c) : enterOffice(E, c)),
      leave: () => leaveInside(E),
    });
  }

  // ---------------- furniture ----------------
  function furnishOffice(c, E) {
    const { g, W, D, H, F, M, put, QH, plant } = c, L = {};
    // the manager's desk at the back, the company's name on the wall behind
    F(1.9, 0.76, 0.8, 0, -D / 2 + 1.6, 0x5a4030);
    const mon = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.34, 0.04), new THREE.MeshStandardMaterial({ color: 0x080808, emissive: 0x3060a0, emissiveIntensity: 0.5 })); mon.position.set(-0.4, 0.98, -D / 2 + 1.4); mon.rotation.y = Math.PI; g.add(mon);
    for (let k = 0; k < 4; k++) { const pap = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.012, 0.3), M(0xf4f2ec, 0.9)); pap.position.set(0.35 + k * 0.03, 0.77 + k * 0.012, -D / 2 + 1.6); pap.rotation.y = k * 0.2; g.add(pap); }
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 0.6), new THREE.MeshStandardMaterial({ map: signTex(E.name, E.job ? E.job.name.toUpperCase() : ''), roughness: 0.6 })); sign.position.set(0, H - 0.75, -D / 2 + 0.02); g.add(sign);
    L.boss = { x: 0, z: -D / 2 + 0.75 }; L.talk = { x: 0, z: -D / 2 + 2.45 };
    // the punch clock and the card rack by the door; the roster board
    const clock = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.42, 0.32), M(0x8a8f94, 0.4, 0.6)); clock.position.set(-W / 2 + 0.1, 1.35, D / 2 - 1.6); g.add(clock);
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), M(0xf4f0e2, 0.5)); face.position.set(-W / 2 + 0.205, 1.45, D / 2 - 1.6); face.rotation.y = Math.PI / 2; g.add(face);
    const rack = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.6, 0.4), M(0x6a6e72, 0.5, 0.5)); rack.position.set(-W / 2 + 0.03, 1.3, D / 2 - 2.05); g.add(rack);
    for (let k = 0; k < 8; k++) { const card = new THREE.Mesh(new THREE.BoxGeometry(0.01, 0.16, 0.08), M(0xf0e6c8, 0.9)); card.position.set(-W / 2 + 0.07, 1.12 + (k % 4) * 0.12, D / 2 - 2.14 + Math.floor(k / 4) * 0.17); g.add(card); }
    L.clock = { x: -W / 2 + 0.75, z: D / 2 - 1.75 };
    const rc = document.createElement('canvas'); rc.width = 512; rc.height = 340;
    const rtex = new THREE.CanvasTexture(rc); rtex.colorSpace = THREE.SRGBColorSpace; rtex.anisotropy = 4;
    const rz = -D / 2 + 3.6;
    const roster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ map: rtex, roughness: 0.85 })); roster.position.set(-W / 2 + 0.03, 1.5, rz); roster.rotation.y = Math.PI / 2; g.add(roster);
    L.roster = { x: -W / 2 + 0.8, z: rz, canvas: rc, tex: rtex };
    // lockers and a bench along the right wall
    const nL = E.theme === 'courier' ? 3 : 5;
    const ventT = tile((x) => { x.fillStyle = '#6a7680'; x.fillRect(0, 0, 128, 128); x.fillStyle = 'rgba(0,0,0,0.35)'; for (let i = 0; i < 5; i++) x.fillRect(20, 10 + i * 8, 88, 3); x.fillStyle = 'rgba(0,0,0,0.25)'; x.fillRect(0, 0, 3, 128); x.fillStyle = '#c8ccd0'; x.fillRect(100, 64, 8, 18); }, [1, 1]);
    for (let k = 0; k < nL; k++) { const lk = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1.85, 0.44), [M(0x6a7680, 0.5, 0.4), new THREE.MeshStandardMaterial({ map: ventT, roughness: 0.5, metalness: 0.4 }), M(0x6a7680, 0.5, 0.4), M(0x6a7680, 0.5, 0.4), M(0x6a7680, 0.5, 0.4), M(0x6a7680, 0.5, 0.4)]); lk.position.set(W / 2 - 0.26, 0.925, -D / 2 + 1.0 + k * 0.46); g.add(lk); }
    c.collision.addBox(c.o.x + W / 2 - 0.5, c.o.z - D / 2 + 0.75, c.o.x + W / 2, c.o.z - D / 2 + 1.25 + (nL - 1) * 0.46, c.o.y, c.o.y + 1.9);
    F(0.38, 0.45, 1.8, W / 2 - 1.05, -D / 2 + 1.6, 0x6b4a2c);
    // water cooler and a plant
    F(0.36, 0.95, 0.36, -W / 2 + 0.5, -D / 2 + 0.5, 0xe8e8e4);
    const jug = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.42, 16), new THREE.MeshStandardMaterial({ color: 0x8fc4e8, transparent: true, opacity: 0.6, roughness: 0.1 })); jug.position.set(-W / 2 + 0.5, 1.17, -D / 2 + 0.5); g.add(jug);
    put(plant(), 1.2, W / 2 - 0.6, D / 2 - 0.6, 0, 'y');
    put(QH('Chair_3'), 0.95, 0.9, -D / 2 + 0.85, 0, 'y');
    put(QH('Chair_4'), 0.95, -1.7, -D / 2 + 2.4, Math.PI, 'y');
    // what the company does (along the left wall, between the water cooler and the roster)
    const T = E.theme, tz = -D / 2 + 1.9;
    if (T === 'garage') {
      const tyre = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.85 });
      for (let s = 0; s < 2; s++) for (let k = 0; k < 4; k++) { const t = new THREE.Mesh(new THREE.TorusGeometry(0.3, 0.11, 10, 24), tyre); t.rotation.x = Math.PI / 2; t.position.set(-W / 2 + 0.6 + s * 0.75, 0.11 + k * 0.22, tz); g.add(t); }
      F(0.8, 0.9, 0.45, W / 2 - 1.4, D / 2 - 2.6, 0xb81e1e, 0, true, 0.4);
    } else if (T === 'parcels' || T === 'pizza') {
      for (let k = 0; k < 9; k++) { const s = 0.35 + (k % 3) * 0.08; const bx = new THREE.Mesh(new THREE.BoxGeometry(s, T === 'pizza' ? 0.05 : s * 0.8, s), M(T === 'pizza' ? 0xf2efe6 : 0xa77a48, 0.9)); bx.position.set(-W / 2 + 0.6 + (k % 3) * 0.5, T === 'pizza' ? 0.76 + Math.floor(k / 3) * 0.06 : s * 0.4 + Math.floor(k / 3) * 0.38, tz + (k % 2) * 0.1); g.add(bx); }
      if (T === 'pizza') F(1.6, 0.74, 0.7, -W / 2 + 1.1, tz, 0xb8b8b4, 0, true, 0.3);
    } else if (T === 'medical') {
      F(0.6, 0.55, 1.8, -W / 2 + 0.8, tz, 0xd8d8d8, 0, true, 0.3);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.5, 0.5), new THREE.MeshStandardMaterial({ map: signTex('+', '', { w: 128, h: 128, bg: '#f4f4f2', fg: '#c81e1e' }), roughness: 0.5 })); cab.position.set(W / 2 - 0.06, 1.5, D / 2 - 2.4); g.add(cab);
    } else if (T === 'fire' || T === 'police') {
      const col = T === 'fire' ? 0xe0b020 : 0x24304a;
      for (let k = 0; k < 4; k++) { const coat = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.45), M(col, 0.8)); coat.position.set(-W / 2 + 0.1, 1.1, tz - 0.8 + k * 0.5); g.add(coat); const hat = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(T === 'fire' ? 0x202020 : 0x1a1a24, 0.4)); hat.position.set(-W / 2 + 0.2, 1.75, tz - 0.8 + k * 0.5); g.add(hat); }
    } else if (T === 'hardhat') {
      F(0.4, 1.4, 1.6, -W / 2 + 0.25, tz, 0x7a6a50);
      for (let k = 0; k < 4; k++) { const hat = new THREE.Mesh(new THREE.SphereGeometry(0.15, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), M(k % 2 ? 0xf0c020 : 0xf4f4f0, 0.45)); hat.position.set(-W / 2 + 0.25, 1.4, tz - 0.6 + k * 0.4); g.add(hat); }
      for (let k = 0; k < 3; k++) { const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.6, 14), M(0xf06020, 0.6)); cone.position.set(W / 2 - 1.4 + k * 0.4, 0.3, D / 2 - 2.4); g.add(cone); }
    } else if (T === 'courier') {
      // pigeonholes on the back wall, bikes by the door, bags on hooks, the board with the day's runs
      const ph = new THREE.Group(); ph.position.set(-W / 2 + 1.9, 0, -D / 2 + 0.22); g.add(ph);
      const wood = M(0x9a7a52, 0.7);
      for (let i = 0; i <= 6; i++) { const v = new THREE.Mesh(new THREE.BoxGeometry(0.025, 1.6, 0.4), wood); v.position.set(-1.1 + i * (2.2 / 6), 0.9, 0); ph.add(v); }
      for (let j = 0; j <= 5; j++) { const h2 = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.025, 0.4), wood); h2.position.set(0, 0.1 + j * 0.32, 0); ph.add(h2); }
      for (let i = 0; i < 6; i++) for (let j = 0; j < 5; j++) if ((i * 7 + j * 3) % 4 !== 0) { const env = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12 + ((i + j) % 3) * 0.04, 0.3), M((i + j) % 3 ? 0xf2efe6 : 0xd8c49a, 0.9)); env.position.set(-1.1 + (i + 0.5) * (2.2 / 6), 0.18 + j * 0.32, 0.02); env.rotation.z = ((i * 3 + j) % 5 - 2) * 0.04; ph.add(env); }
      c.collision.addBox(c.o.x - W / 2 + 0.8, c.o.z - D / 2, c.o.x - W / 2 + 3.0, c.o.z - D / 2 + 0.44, c.o.y, c.o.y + 1.8);
      for (let k = 0; k < 3; k++) { const b = bicycle([0x1a6ab8, 0xd0d0d0, 0xc82828][k]); b.position.set(W / 2 - 1.1, 0, D / 2 - 2.0 - k * 0.5); g.add(b); }
      c.collision.addBox(c.o.x + W / 2 - 1.7, c.o.z + D / 2 - 3.3, c.o.x + W / 2 - 0.5, c.o.z + D / 2 - 1.8, c.o.y, c.o.y + 1.0);
      const bagM = M(0x24282c, 0.85);
      for (let k = 0; k < 3; k++) { const bag = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.32, 0.42), bagM); bag.position.set(-W / 2 + 0.1, 1.3, D / 2 - 2.55 - k * 0.4); g.add(bag); const flap = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.42), M(0xe8c020, 0.6)); flap.position.set(-W / 2 + 0.18, 1.4, bag.position.z); g.add(flap); }
      L.bag = { x: -W / 2 + 0.75, z: D / 2 - 2.95 };
      const wb = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.9), new THREE.MeshStandardMaterial({ map: signTex('TODAY: RUSH 4 · STD 11 · SIG 3', 'Bikes back by 7 · Helmets ON', { bg: '#f4f4f0', fg: '#1a3a8a' }), roughness: 0.3 })); wb.position.set(W / 2 - 0.03, 1.6, -0.2); wb.rotation.y = -Math.PI / 2; g.add(wb);
    }
    return L;
  }
  function furnishBarber(c) {
    const { g, W, D, F, M, put, plant } = c, L = { chairs: [], hair: [] };
    const floorT = tile((x) => { for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) { x.fillStyle = (i + j) % 2 ? '#2a2826' : '#dcd7cc'; x.fillRect(i * 64, j * 64, 64, 64); } }, [W / 0.6, D / 0.6]);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorT, roughness: 0.32 })); fl.rotation.x = -Math.PI / 2; fl.position.y = 0.004; fl.receiveShadow = true; g.add(fl);
    const mirT = (() => { const cv = document.createElement('canvas'); cv.width = cv.height = 128; const x = cv.getContext('2d'); const gr = x.createLinearGradient(0, 0, 128, 128); gr.addColorStop(0, '#c9d3d9'); gr.addColorStop(0.45, '#8d999f'); gr.addColorStop(0.55, '#b5c1c7'); gr.addColorStop(1, '#6f7a80'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128); x.fillStyle = 'rgba(255,255,255,0.18)'; x.beginPath(); x.moveTo(20, 0); x.lineTo(46, 0); x.lineTo(0, 46); x.lineTo(0, 20); x.fill(); const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const mirrorM = new THREE.MeshStandardMaterial({ map: mirT, emissive: 0xffffff, emissiveMap: mirT, emissiveIntensity: 0.35, roughness: 0.05, metalness: 0.2 }), frameM = M(0x2a1a10, 0.5);
    const n = 3, z0 = -D / 2 + 1.8, dz = Math.min(2.2, (D - 3.6) / 2);
    // the counter under the mirrors: tonic bottles, a jar of combs in blue disinfectant, clippers, a hand mirror
    F(0.42, 0.86, D - 2.8, -W / 2 + 0.21, -0.8, 0xe6e0d4, 0, true, 0.35);
    for (let k = 0; k < n; k++) {
      const z = z0 + k * dz, x = -W / 2 + 1.35;
      const ch = barberChair(M); ch.position.set(x, 0, z); ch.rotation.y = Math.PI / 2; g.add(ch);
      c.collision.addBox(c.o.x + x - 0.36, c.o.z + z - 0.36, c.o.x + x + 0.36, c.o.z + z + 0.36, c.o.y, c.o.y + 0.9);
      const mir = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.0), mirrorM); mir.position.set(-W / 2 + 0.025, 1.62, z); mir.rotation.y = Math.PI / 2; g.add(mir);
      for (const [w, h, dy, dzz] of [[1.3, 0.06, 0.53, 0], [1.3, 0.06, -0.53, 0], [0.06, 1.1, 0, 0.63], [0.06, 1.1, 0, -0.63]]) { const fr = new THREE.Mesh(new THREE.BoxGeometry(0.04, h, w === 0.06 ? 0.06 : w), frameM); fr.position.set(-W / 2 + 0.03, 1.62 + dy, z + dzz); g.add(fr); }
      const jar = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.26, 16), new THREE.MeshStandardMaterial({ color: 0x2a7ad8, transparent: true, opacity: 0.75, roughness: 0.05 })); jar.position.set(-W / 2 + 0.2, 0.99, z - 0.35); g.add(jar);
      for (let b = 0; b < 3; b++) { const bo = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.2, 10), M([0x2e8a3a, 0xc89020, 0x8a2a8a][(k + b) % 3], 0.2)); bo.position.set(-W / 2 + 0.16, 0.96, z + 0.25 + b * 0.08); g.add(bo); }
      const clip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.04, 0.16), M(0x181818, 0.4)); clip.position.set(-W / 2 + 0.28, 0.88, z - 0.1); g.add(clip);
      const hd = hairDecal(); hd.position.set(x + 0.25, 0.012, z + 0.1); hd.visible = k === 0; g.add(hd); L.hair.push(hd);
      L.chairs.push({ x, z, stand: { x: x + 0.78, z: z + 0.1 } });
    }
    // the shampoo sink and its chair at the back
    F(0.75, 0.82, 0.55, W / 2 - 1.3, -D / 2 + 0.32, 0xf2f2f0, 0, true, 0.3);
    const basin = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.34), M(0x30343a, 0.2)); basin.position.set(W / 2 - 1.3, 0.83, -D / 2 + 0.34); g.add(basin);
    const tap = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.22, 8), M(0xd8dade, 0.2, 1)); tap.position.set(W / 2 - 1.3, 0.94, -D / 2 + 0.12); g.add(tap);
    put(c.QH('Chair_2'), 0.9, W / 2 - 1.3, -D / 2 + 1.05, 0, 'y');
    L.sink = { x: W / 2 - 1.3, z: -D / 2 + 1.05, work: { x: W / 2 - 2.1, z: -D / 2 + 0.85 } };
    // fresh towels on a shelf at the back
    F(1.1, 1.5, 0.38, 0.2, -D / 2 + 0.2, 0x6a4a2c);
    for (let k = 0; k < 6; k++) { const tw = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.26), M(0xf8f8f4, 0.95)); tw.position.set(-0.15 + (k % 3) * 0.33, 1.52 + Math.floor(k / 3) * 0.08, -D / 2 + 0.24); g.add(tw); }
    L.towels = { x: 0.2, z: -D / 2 + 0.9 };
    // the waiting bench, a table with magazines, the price list
    const bz0 = -D / 2 + 2.3, bz1 = D / 2 - 3.0, blen = Math.max(1.6, bz1 - bz0), bzc = (bz0 + bz1) / 2;
    F(0.5, 0.45, blen, W / 2 - 0.3, bzc, 0x5a3a22);
    F(0.08, 0.55, blen, W / 2 - 0.06, bzc, 0x5a3a22, 0.45);
    F(0.5, 0.42, 0.9, W / 2 - 1.15, bzc, 0x2a1a10, 0, true, 0.3);
    for (let k = 0; k < 3; k++) { const mag = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.01, 0.3), M([0xc83030, 0x3060b0, 0xe0c040][k], 0.6)); mag.position.set(W / 2 - 1.15 + (k - 1) * 0.12, 0.43 + k * 0.01, bzc + (k - 1) * 0.18); mag.rotation.y = k * 0.4; g.add(mag); }
    L.bench = [{ x: W / 2 - 0.42, z: bzc - blen / 4 }, { x: W / 2 - 0.42, z: bzc + blen / 4 }];
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshStandardMaterial({ map: signTex('CUT $25 · SHAVE $15', 'THE WORKS $35 · BEARD $12 · COLOUR $30', { h: 256, bg: '#efe6d0', fg: '#2a1a10' }), roughness: 0.8 })); poster.position.set(W / 2 - 0.025, 1.75, bzc); poster.rotation.y = -Math.PI / 2; g.add(poster);
    // the till at the front counter
    F(1.7, 1.0, 0.55, W / 2 - 1.75, D / 2 - 2.25, 0x3a2416, 0, true, 0.4);
    const till = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.22, 0.34), M(0x2a2a2a, 0.4, 0.3)); till.position.set(W / 2 - 1.4, 1.11, D / 2 - 2.3); g.add(till);
    const disp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.1, 0.02), new THREE.MeshStandardMaterial({ color: 0x0a0a0a, emissive: 0x30c060, emissiveIntensity: 0.6 })); disp.position.set(W / 2 - 1.4, 1.27, D / 2 - 2.12); g.add(disp);
    L.till = { x: W / 2 - 1.6, z: D / 2 - 1.55, boss: { x: W / 2 - 1.75, z: D / 2 - 2.95 } };
    // a little pole on the back wall and a plant by the door
    const poleT = tile((x) => { for (let i = 0; i < 8; i++) { x.fillStyle = ['#c22', '#fff', '#23c', '#fff'][i % 4]; x.fillRect(0, i * 16, 128, 16); } }, [1, 1]);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.7, 16), new THREE.MeshStandardMaterial({ map: poleT, emissive: 0x222222, emissiveMap: poleT })); pole.position.set(-1.5, 1.9, -D / 2 + 0.1); g.add(pole);
    L.poleTex = poleT;
    put(plant(), 1.1, -W / 2 + 0.5, D / 2 - 0.6, 0, 'y');
    return L;
  }

  // ---------------- people inside ----------------
  let inside = null; // { E, it, o, L, people: [], boss }
  const person = (look, x, z, rot, anim, y = 0) => {
    const h = new Human(game.lib, looks[((look % looks.length) + looks.length) % looks.length]);
    const o = inside.o;
    h.root.position.set(o.x + x, o.y + 0.05 + y, o.z + z); h.root.rotation.y = rot; h.play(anim, 0);
    scene.add(h.root); inside.people.push(h);
    return h;
  };
  const drop = (h) => { if (!h) return; h.root.parent?.remove(h.root); h.dispose?.(); if (inside) { const i = inside.people.indexOf(h); if (i >= 0) inside.people.splice(i, 1); } };
  function drawRoster(E) {
    const R = E.L?.roster; if (!R) return;
    const x = R.canvas.getContext('2d'), w = R.canvas.width, h = R.canvas.height;
    x.fillStyle = '#c49a6a'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#fbfaf4'; x.fillRect(16, 14, w - 32, h - 28);
    x.fillStyle = '#1a1a1a'; x.font = 'bold 26px Arial'; x.textAlign = 'left'; x.fillText(`${E.name.toUpperCase()} · THIS WEEK`, 28, 46);
    x.font = '19px Arial';
    const e = emp(E.id), mine = e ? e.sched : [];
    for (let k = 0; k < 7; k++) {
      const day = sky.day + k, y = 82 + k * 34, s = mine.find((q) => Math.floor(q.t / 24) === day && q.st !== 'sick');
      x.fillStyle = k === 0 ? '#c81e1e' : '#1a1a1a'; x.fillText(`${DAYS[day % 7]}${k === 0 ? ' (today)' : ''}`, 28, y);
      const crew = [FIRST[(hash(E.id) + day * 7) % FIRST.length], FIRST[(hash(E.id) + day * 13 + 5) % FIRST.length]].join(', ');
      x.fillStyle = '#333'; x.fillText(crew, 170, y);
      if (s) { x.fillStyle = '#1a3a8a'; x.font = 'bold 19px Arial'; x.fillText(`YOU ${hh(s.t % 24)}`, 360, y); x.font = '19px Arial'; }
    }
    R.tex.needsUpdate = true;
  }
  function punch(E) {
    const e = emp(E.id);
    if (!e) { toast(`Talk to ${E.boss.first} about a job first.`, 2.2); return; }
    const s = current(E, e);
    if (!s) { const n = upcoming(e)[0]; toast(n ? `No shift right now. Next: ${fmt(n.t)}.` : 'No shift right now.', 2.4); return; }
    player.h?.play?.('Interact', 0.1, 1.2, true);
    clockIn(E, e, s);
  }
  function enterOffice(E, c) {
    inside = { E, it: c.it, o: c.it.o, L: E.L, people: [] };
    const L = E.L, open = E.isOpen() || (cur && cur.E === E) || !!current(E, emp(E.id));
    if (open) inside.boss = person(E.boss.look, L.boss.x, L.boss.z, 0, 'Idle_Loop');
    c.point({ x: inside.o.x + L.talk.x, z: inside.o.z + L.talk.z, r: 1.4, color: 0xffe040, show: () => !!inside?.boss, label: () => `${keyHint(game)} talk to ${E.boss.name} (${E.boss.title})`, use: () => talk(E.id) });
    c.point({ x: inside.o.x + L.clock.x, z: inside.o.z + L.clock.z, r: 1.0, color: 0xffe040, label: () => `${keyHint(game)} punch the clock`, use: () => punch(E) });
    c.point({ x: inside.o.x + L.roster.x, z: inside.o.z + L.roster.z, r: 1.0, color: 0xffe040, label: () => `${keyHint(game)} read the roster`, use: () => { const e = emp(E.id); if (e) scheduleToast(E, e); else toast(`${E.name} is hiring: talk to ${E.boss.first}.`, 2.4); } });
    if (L.bag) c.point({ x: inside.o.x + L.bag.x, z: inside.o.z + L.bag.z, r: 1.0, color: 0xffe040, show: () => !!E.bagReady, label: () => `${keyHint(game)} grab a messenger bag and go`, use: () => { E.bagReady = false; const s = cur?.s; estate.leave(); jobs.start(E.id, { work: true, sched: s }); if (!jobs.active) cur = null; } });
    drawRoster(E);
  }
  function leaveInside(E) {
    if (!inside || inside.E !== E) return;
    if (E.kind === 'barber' && shop?.shift) endShop(false, 'You walked out in the middle of a shift.');
    if (E.bagReady) { E.bagReady = false; if (cur && cur.E === E) { const s = cur.s; cur = null; if (s && emp(E.id)) { s.st = 'failed'; warn(E, emp(E.id), 'You walked out without your bag'); } } }
    for (const h of inside.people.slice()) drop(h);
    inside = null; shop = null;
  }

  // ---------------- the barbershop ----------------
  let shop = null; // { E, pts, shift }
  function enterBarber(E, c) {
    inside = { E, it: c.it, o: c.it.o, L: E.L, people: [] };
    const L = E.L, o = inside.o, open = E.isOpen() || (cur && cur.E === E) || P.ownBiz[E.id] || !!current(E, emp(E.id));
    shop = { E, shift: null };
    if (open) {
      inside.boss = person(E.boss.look, L.till.boss.x, L.till.boss.z, 0, 'Idle_Loop');
      // a barber at the first chair with a customer, and somebody waiting
      const k = hash(E.id + sky.day);
      const ch = L.chairs[0];
      person(k + 3, ch.x + 0.05, ch.z, -Math.PI / 2, 'Sitting_Idle_Loop', 0.1);
      person(k + 7, ch.stand.x, ch.stand.z, -Math.PI / 2, 'Idle_Talking_Loop');
      for (let i = 0; i < 1 + (k % 2); i++) person(k + 11 + i, L.bench[i].x, L.bench[i].z, -Math.PI / 2, 'Sitting_Idle_Loop', 0.02);
    }
    c.point({ x: o.x + L.till.x, z: o.z + L.till.z, r: 1.3, color: 0xffe040, show: () => !!inside?.boss && !(shop?.shift?.task?.kind === 'till'), label: () => `${keyHint(game)} talk to ${E.boss.name} (${E.boss.title})`, use: () => talk(E.id) });
    const ch = L.chairs[1];
    shop.pts = {
      chair: c.point({ x: o.x + ch.stand.x, z: o.z + ch.stand.z, r: 1.2, color: 0xffe040, show: () => shop?.shift?.task?.kind === 'cut' && shop.shift.task.phase === 'go', label: () => `${keyHint(game)} ask what they want, then cut`, use: () => cutDialog() }),
      sweep: c.point({ x: o.x, z: o.z, r: 1.2, color: 0xffe040, show: () => shop?.shift?.task?.kind === 'sweep' && shop.shift.task.phase === 'go', label: () => `${keyHint(game)} sweep up the hair`, use: () => work(4, 'Sweeping…') }),
      sink: c.point({ x: o.x + L.sink.work.x, z: o.z + L.sink.work.z, r: 1.2, color: 0xffe040, show: () => shop?.shift?.task?.kind === 'shampoo' && shop.shift.task.phase === 'go', label: () => `${keyHint(game)} shampoo and rinse`, use: () => work(5, 'Shampooing…') }),
      towels: c.point({ x: o.x + L.towels.x, z: o.z + L.towels.z, r: 1.2, color: 0xffe040, show: () => shop?.shift?.task?.kind === 'towels' && shop.shift.task.phase === 'go', label: () => `${keyHint(game)} fold the towels`, use: () => work(4, 'Folding towels…') }),
      till: c.point({ x: o.x + L.till.x, z: o.z + L.till.z, r: 1.3, color: 0xffe040, show: () => shop?.shift?.task?.kind === 'till' && shop.shift.task.phase === 'go', label: () => `${keyHint(game)} ring them up`, use: () => tillDialog() }),
    };
  }
  const rankAt = (E) => (P.ownBiz[E.id] ? 5 : emp(E.id)?.rank ?? 0);
  function shopStart(E, s) {
    if (!shop || shop.E !== E) { cur = null; return; }
    const rank = rankAt(E);
    shop.shift = { E, s, rank, done: 0, need: rank === 0 ? 5 : 4, rating: 5, earned: 0, t0: now(), task: null, last: null, wait: 0.5, warned: false };
    hud.bigMessage('ON THE CLOCK', `${E.name} · ${E.ladder[rank]}`, 2.5);
  }
  function custAt(k, x, z, rot, anim, y = 0) { const sh = shop.shift; sh.cust = person(hash(`${sh.E.id}:${sh.done}:${k}:${Math.floor(now())}`), x, z, rot, anim, y); }
  function nextTask() {
    const sh = shop.shift, L = sh.E.L, o = inside.o;
    const chores = ['sweep', 'shampoo', 'till', 'towels'].filter((k) => k !== sh.last);
    const kind = sh.rank === 0 ? pickR(chores) : Math.random() < 0.7 ? 'cut' : pickR(chores.filter((k) => k !== 'shampoo'));
    sh.last = kind;
    const T = sh.task = { kind, phase: 'go', t: 0 };
    if (kind === 'cut') {
      const opts = STYLES.filter((s) => s.rank <= Math.max(1, sh.rank));
      T.want = pickR(opts); T.line = pickR(T.want.lines);
      const ch = L.chairs[1]; T.at = { x: o.x + ch.stand.x, z: o.z + ch.stand.z };
      custAt(1, ch.x + 0.05, ch.z, -Math.PI / 2, 'Sitting_Idle_Loop', 0.1);
      toast(`A customer sits in your chair: "${T.line}"`, 3.5);
    } else if (kind === 'sweep') {
      const k = (Math.random() * L.hair.length) | 0, hd = L.hair[k];
      hd.visible = true; T.decal = hd;
      shop.pts.sweep.x = o.x + hd.position.x + 0.5; shop.pts.sweep.z = o.z + hd.position.z;
      T.at = { x: shop.pts.sweep.x, z: shop.pts.sweep.z };
      toast(`${sh.E.boss.first}: "Sweep up that hair by chair ${k + 1}."`, 2.6);
    } else if (kind === 'shampoo') {
      custAt(2, L.sink.x, L.sink.z, 0, 'Sitting_Idle_Loop', 0.02);
      T.at = { x: o.x + L.sink.work.x, z: o.z + L.sink.work.z };
      toast(`${sh.E.boss.first}: "Shampoo the gentleman at the sink."`, 2.6);
    } else if (kind === 'till') {
      custAt(3, L.till.x, L.till.z + 0.15, Math.PI, 'Idle_Loop');
      T.bill = pickR([12, 15, 20, 25, 30, 35]); T.paid = T.bill <= 15 ? 20 : T.bill < 30 ? (Math.random() < 0.5 ? 40 : 50) : 50;
      T.at = { x: o.x + L.till.x, z: o.z + L.till.z };
      toast(`A customer's at the till with a ${money(T.bill)} ticket.`, 2.6);
    } else {
      T.at = { x: o.x + L.towels.x, z: o.z + L.towels.z };
      toast(`${sh.E.boss.first}: "Fold the clean towels on the back shelf."`, 2.6);
    }
  }
  function work(secs, label, after) {
    const T = shop?.shift?.task; if (!T) return;
    T.phase = 'work'; T.t = secs; T.label = label; T.after = after || null; T.anim = 0;
  }
  function cutDialog() {
    const sh = shop?.shift, T = sh?.task; if (!T || T.kind !== 'cut') return;
    const wrong = STYLES.filter((s) => s !== T.want).sort(() => Math.random() - 0.5).slice(0, 3);
    const opts = [T.want, ...wrong].sort(() => Math.random() - 0.5).map((s) => [s.label, () => {
      if (s === T.want) { work(6, 'Cutting…'); toast('"Perfect, thanks."', 1.6); return; }
      sh.rating = Math.max(1, sh.rating - 1.3);
      toast(`Customer: "${pickR(ANGRY)}" ${sh.E.boss.first}: "That one's on the house. Pay attention."`, 3.4);
      T.comped = true; work(3, 'Fixing it…');
    }]);
    opts.push(['"Sorry, what was that?"', () => toast(`"${T.line}"`, 3)]);
    game.openDialog('The customer', `"${T.line}"`, opts);
  }
  function tillDialog() {
    const sh = shop?.shift, T = sh?.task; if (!T || T.kind !== 'till') return;
    const right = T.paid - T.bill;
    const set = new Set([right]); for (const d of [5, -5, 10, -10, 15]) { if (set.size >= 4) break; if (right + d > 0) set.add(right + d); }
    const opts = [...set].sort(() => Math.random() - 0.5).map((v) => [`Give back ${money(v)}`, () => {
      if (v === right) { toast('"Thanks. See you in a few weeks."', 1.8); }
      else { sh.rating = Math.max(1, sh.rating - 0.8); if (v > right) sh.earned -= v - right; toast(v > right ? `You gave ${money(v - right)} too much. It comes out of your pay.` : '"Hey. That\'s not right." You fix it, red in the face.', 3); }
      complete();
    }]);
    game.openDialog('At the till', `A ${money(T.bill)} ticket. They hand you ${money(T.paid)}. Change?`, opts);
  }
  function complete() {
    const sh = shop.shift, T = sh.task, m = PAY[sh.rank] * (P.ownBiz[sh.E.id] ? 2 : 1);
    if (T.kind === 'cut') {
      if (!T.comped) { const tip = Math.round(T.want.price * 0.25 * Math.max(0, sh.rating - 2.5) / 2.5 * (sharp() ? 1.2 : 1)); sh.earned += T.want.price * 0.45 * m + tip; if (tip > 0) toast(`Tip: ${money(tip)}`, 1.6); }
    } else sh.earned += 14 * m;
    if (T.decal) T.decal.visible = false;
    if (sh.cust) { const h = sh.cust; sh.cust = null; h.play('Walk_Loop', 0.2); h.root.rotation.y = 0; (shop.leaving = shop.leaving || []).push({ h, t: 2.2 }); }
    sh.done++; sh.task = null; sh.wait = 2.5;
    if (sh.done >= sh.need) endShop(true);
  }
  function endShop(ok, why, quiet = false) {
    const sh = shop?.shift; if (!sh) return;
    shop.shift = null;
    if (sh.cust) drop(sh.cust);
    if (sh.task?.decal) sh.task.decal.visible = false;
    const pay = Math.max(0, Math.round(sh.earned));
    if (pay > 0) career.earn(pay, `${sh.E.name} shift`);
    if (!quiet) {
      if (ok) hud.bigMessage('SHIFT COMPLETE', `${sh.E.name} · earned ${money(pay)} · ${'★'.repeat(Math.round(sh.rating))}${'☆'.repeat(5 - Math.round(sh.rating))}`, 3);
      else hud.bigMessage('SHIFT OVER', why || sh.E.name, 2.6);
    }
    shiftEnded(sh.E.id, ok, { rating: sh.rating, earned: pay });
  }
  function updateShop(dt) {
    if (shop?.leaving?.length) for (let i = shop.leaving.length - 1; i >= 0; i--) { const L = shop.leaving[i]; L.t -= dt; L.h.root.position.z += dt * 1.1; if (L.t <= 0) { drop(L.h); shop.leaving.splice(i, 1); } }
    const sh = shop?.shift; if (!sh) return '';
    if (now() - sh.t0 > 4) { endShop(sh.done >= sh.need / 2, 'The shop closes up. You didn\'t get through much.'); return ''; }
    if (!sh.task) { if ((sh.wait -= dt) <= 0) nextTask(); return `${sh.E.name.toUpperCase()} · ${sh.done}/${sh.need} done · ${money(sh.earned)}`; }
    const T = sh.task;
    if (T.phase === 'work') {
      const d = Math.hypot(player.pos.x - T.at.x, player.pos.z - T.at.z);
      if (d < 1.9) {
        T.t -= dt;
        if ((T.anim -= dt) <= 0) { T.anim = 1.4; player.h?.play?.('Interact', 0.15, 0.9, true); }
        if (T.t <= 0) { complete(); return ''; }
        return `${T.label} ${Math.ceil(T.t)}s`;
      }
      if (d > 4 && !T.left) { T.left = true; sh.rating = Math.max(1, sh.rating - 0.6); toast(`${sh.E.boss.first}: "Where are you going? Finish what you started!"`, 2.6); }
      return `${T.label} (go back)`;
    }
    const what = { cut: `Customer in your chair: "${T.line}"`, sweep: 'Sweep up the hair', shampoo: 'Shampoo at the sink', till: 'Customer at the till', towels: 'Fold the towels' }[T.kind];
    return `${sh.E.name.toUpperCase()} · ${what} · ${sh.done}/${sh.need}`;
  }

  // ---------------- messenger stops: real office doors ----------------
  const STREETS = ['Harbor Blvd', 'Calvera Ave', 'Gulf St', 'Magnolia St', 'Pelican Way', 'Live Oak Dr', 'Sabine St', 'Mission St', 'Cotton Row'];
  function officeStops(n, from) {
    const c = CITY.downtown, list = estate.doors.filter((d) => !d.b.ruined && !estate.special.has(d.i) && (d.b.style === 1 || d.b.style === 0 || d.b.style === 5) && Math.hypot(d.x - c[0], d.z - c[1]) < 280 && Math.hypot(d.x - from[0], d.z - from[1]) > 40);
    if (list.length < n) return null;
    for (let k = list.length - 1; k > 0; k--) { const j = (Math.random() * (k + 1)) | 0; [list[k], list[j]] = [list[j], list[k]]; }
    return list.slice(0, n).map((d, i) => [d.x + d.nx * 0.6, d.z + d.nz * 0.6, `${i % 2 ? 'deliver to' : 'pick up at'} ${100 + (hash('o' + d.i) % 4800)} ${STREETS[hash('s' + d.i) % STREETS.length]}`]);
  }

  // ---------------- managers standing outside (civic places, site offices) ----------------
  const outdoor = [...employers.values()].filter((E) => E.outdoor);
  function updateOutdoor(dt) {
    const pp = player.pos;
    for (const E of outdoor) {
      const at = E.outdoor, d = Math.hypot(pp.x - at.x, pp.z - at.z), want = d < 45 && !game.S.indoors && E.isOpen();
      if (want && !E.h) {
        E.h = new Human(game.lib, looks[E.boss.look]);
        E.h.root.position.set(at.x, collision.surface(at.x, at.z, hm.height(at.x, at.z) + 3) + 0.02, at.z);
        E.h.play('Idle_Loop', 0); scene.add(E.h.root);
      } else if (!want && E.h && d > 60 || (!E.isOpen() && E.h)) { E.h.root.parent?.remove(E.h.root); E.h.dispose?.(); E.h = null; }
      if (E.h) {
        const hp = E.h.root.position, face = Math.atan2(pp.x - hp.x, pp.z - hp.z);
        if (d < 9) { E.h.root.rotation.y += Math.atan2(Math.sin(face - E.h.root.rotation.y), Math.cos(face - E.h.root.rotation.y)) * Math.min(1, dt * 3); E.h.play('Idle_Talking_Loop', 0.4); } else E.h.play('Idle_Loop', 0.4);
        if (d < 80) E.h.update(dt);
      }
    }
  }

  function boardLabel(Ej) {
    const E = Ej.id ? employers.get(Ej.id) || Ej : Ej;
    if (!E || !E.boss) return null;
    const e = emp(E.id), s = e && current(E, e), job = E.job ? `${E.job.name} · ` : '';
    const tail = firedFrom(E.id) ? ' · you were fired' : P.ownBiz[E.id] ? ' · your shop' : s ? ` · CLOCK IN (${fmt(s.t)})` : e ? ` · ${E.ladder[e.rank]}` : E.isOpen() ? ' · hiring' : ` · closed, opens ${hh(E.open[0])}`;
    return `${keyHint(game)} talk to ${E.boss.name}, ${E.boss.title} (${job}${E.name})${tail}`;
  }

  // ---------------- the phone: a Work tab ----------------
  let phoneHooked = false;
  function hookPhone() {
    const ph = game.phoneSys?.phone; if (!ph || phoneHooked) return; phoneHooked = true;
    const cfg = ph.cfg;
    cfg.tabs.splice(Math.max(0, cfg.tabs.findIndex((t) => t.k === 'jobs') + 1), 0, { k: 'work', label: 'Work' });
    const items0 = cfg.items, row0 = cfg.row, act0 = cfg.act, note0 = cfg.note;
    cfg.note = (t) => t === 'work' ? 'Your jobs and shifts. Clock in up to 15 minutes late; later is a warning, a no-show is a warning, three and you\'re fired. Call in sick before a shift (once a week is fine).' : note0(t);
    cfg.items = (t) => {
      if (t !== 'work') return items0(t);
      const out = [];
      for (const E of employers.values()) {
        const e = emp(E.id);
        if (!e) { if (firedFrom(E.id)) out.push({ E, fired: true }); continue; }
        out.push({ E, e });
        const n = upcoming(e).find((s) => s.t > now());
        if (n && n.t - now() < 24) out.push({ E, e, sick: n });
      }
      if (!out.length) out.push({ none: true });
      return out;
    };
    cfg.row = (it, t) => {
      if (t !== 'work') return row0(it, t);
      if (it.none) return { name: 'No jobs yet', sub: 'Every job board has a manager: talk to them to get hired.', stats: [], btn: '·', cls: 'dis' };
      if (it.fired) return { name: it.E.name, sub: `Fired. They'll talk to you again on ${DAYS[P.employ[it.E.id].firedUntil % 7]}.`, stats: [], btn: '·', cls: 'dis' };
      if (it.sick) return { name: `Call in sick: ${fmt(it.sick.t)}`, sub: `${it.E.name}. Once a week is fine; more is a warning (unless you're really hurt).`, stats: [], btn: 'Call', cls: '' };
      const n = upcoming(it.e)[0], e = it.e;
      return { name: `${it.E.name} · ${it.E.ladder[e.rank]}`, sub: `${P.ownBiz[it.E.id] ? 'Your business' : n ? `Next shift ${fmt(n.t)}${n.t - now() < 0 ? ' (NOW)' : ` (in ${Math.max(0, Math.round(n.t - now()))} h)`}` : 'No shifts on the roster'} · ${e.shifts} shifts${e.warn ? ` · ⚠ ${e.warn}/3` : ''}`, stats: [['Next rank', e.rank >= 5 ? 1 : Math.min(1, e.atRank / NEED[e.rank]), e.rank >= 5 ? 'top' : `${e.atRank}/${NEED[e.rank]}`]], btn: 'GPS', cls: 'own' };
    };
    cfg.act = (it, t) => {
      if (t !== 'work') return act0(it, t);
      if (it.none || it.fired) return;
      if (it.sick) { callSick(it.E, it.e); ph.render?.(); return; }
      const b = it.E.board || { x: it.E.outdoor?.x, z: it.E.outdoor?.z };
      if (b.x != null) { game.setWaypoint?.(b.x, b.z, it.E.name); ph.close?.(); }
    };
  }

  // ---------------- the clock: reminders, no-shows, pay day ----------------
  let tickT = 0, lastDay = sky.day;
  function tick() {
    const t = now();
    for (const E of employers.values()) {
      const e = emp(E.id); if (!e) continue;
      plan(E, e);
      for (const s of e.sched) {
        if (s.st !== 'due') continue;
        const until = s.t - t, near = estate.inside?.d === E.door || (E.board && Math.hypot(player.pos.x - E.board.x, player.pos.z - E.board.z) < 30);
        if (!s.rem && until < 2 && until > 0) { s.rem = 1; text(E, `Reminder: you're on at ${hh(s.t % 24)} today.`); if (!near) toast(`📅 ${E.name}: your shift starts at ${hh(s.t % 24)} (${Math.round(until * 60)} min).`, 3); }
        if (s.rem === 1 && until < 0.5 && until > 0) { s.rem = 2; if (!near && !jobs.active && !game.missions?.active) { const b = E.board || E.outdoor; if (b) game.setWaypoint?.(b.x, b.z, `${E.name} (shift ${hh(s.t % 24)})`); toast(`📅 ${E.name} at ${hh(s.t % 24)}: GPS set.`, 2.6); } }
        if (t > s.t + 2) {
          s.st = 'missed'; e.missedRow++;
          if (warn(E, e, `No-show for your ${fmt(s.t)} shift`, e.missedRow >= 2)) break;
        }
      }
    }
    if (sky.day !== lastDay) {
      lastDay = sky.day;
      let pay = 0;
      for (const E of employers.values()) { const e = emp(E.id); if (e && e.rank >= 5) pay += E.salary; if (P.ownBiz[E.id]) pay += E.take; }
      if (pay > 0) career.earn(pay, 'salary and takings');
    }
  }

  // trimming yourself with the grooming kit (at home and at the hideout)
  estate.onEnter(({ it, owned, point }) => { if (owned) point({ x: it.o.x - 2.2, z: it.o.z - 1.2, r: 1.2, color: 0x9fc4c0, show: () => !!P.kit.clippers, label: () => `${keyHint(game)} trim your hair and beard (grooming kit)`, use: () => selfTrim() }); });
  if (game.gang?.local) { const p = game.gang.local(-3, 9); interact.add({ x: p.x, z: p.z, r: 1.6, color: 0x9fc4c0, show: () => !!P.kit.clippers && game.S.mode === 'foot', label: () => `${keyHint(game)} trim your hair and beard (grooming kit)`, use: () => selfTrim() }); }
  function selfTrim() { if (P.groom) { P.groom.hair = 0; P.groom.beard = 0; } game.groom?.apply(); player.h?.play?.('Interact', 0.1, 1, true); toast('A rough job, but it\'ll do.', 2); }

  const api = {
    boardLabel: (def) => boardLabel(def), talk, payMult, sharp, shiftEnded, officeStops,
    update(dt) {
      hookPhone();
      if ((tickT -= dt) <= 0) { tickT = 1; try { tick(); } catch (e) { console.error('[work] ' + (e && e.message), e); } }
      updateOutdoor(dt);
      if (inside) {
        for (const h of inside.people) h.update(dt);
        if (inside.boss) { const hp = inside.boss.root.position, want = Math.atan2(player.pos.x - hp.x, player.pos.z - hp.z); inside.boss.root.rotation.y += Math.atan2(Math.sin(want - inside.boss.root.rotation.y), Math.cos(want - inside.boss.root.rotation.y)) * Math.min(1, dt * 3); }
        if (inside.L?.poleTex) inside.L.poleTex.offset.y -= dt * 0.25;
      }
      return shop ? updateShop(dt) : '';
    },
    expose: {
      employers, emp, hire: (id, trial = false) => hire(employers.get(id), trial), fire: (id, why = 'Fired') => { const E = employers.get(id), e = emp(id); if (E && e) fire(E, e, why); },
      quit: (id) => quit(employers.get(id)), clockIn: (id) => { const E = employers.get(id), e = emp(id), s = e && current(E, e); return s ? clockIn(E, e, s) : false; },
      begin: (id) => { const E = employers.get(id), e = emp(id); return e ? begin(E, e, null) : false; }, callSick: (id) => callSick(employers.get(id), emp(id)),
      current: (id) => current(employers.get(id), emp(id)), upcoming: (id) => upcoming(emp(id)), plan: (id) => plan(employers.get(id), emp(id)), tick: () => tick(),
      get shift() { return cur; }, get shop() { return shop; }, get inside() { return inside; }, complete: () => complete(), cutDialog, tillDialog, nextTask: () => nextTask(),
      LADDERS, PAY, NEED, STYLES,
    },
  };
  return api;
}
