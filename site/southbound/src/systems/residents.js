// The people of Calvera: about 3,000 residents, each with a name, a home, a job (or not), friends,
// and a day: asleep at home, up and out, at work, lunch, back home, and some evenings out with
// friends at a bar or round at a friend's house; weekends are their own. Where everyone is at any
// moment is worked out from that routine, so a resident across the map is exactly where their day
// says they are without costing anything. Near the player, the ones who are outdoors (on their way
// somewhere, at a bar's door, out with friends) are made into real people on the street
// (systems/population.js). Kill one and they're gone for good; someone new moves in 20 minutes later.
//
// This file is the pure part (no three.js, no DOM): building the town and placing people in time.

const FIRST_M = ['James', 'Marcus', 'Luis', 'Dwayne', 'Tyrell', 'Andre', 'Cody', 'Jesse', 'Earl', 'Raymond', 'Hector', 'Pierre', 'Beau', 'Wade', 'Darnell', 'Miguel', 'Travis', 'Clint', 'Reggie', 'Jean-Paul', 'Tommy', 'Victor', 'Leon', 'Calvin', 'Rusty', 'Omar', 'Felix', 'Dale', 'Curtis', 'Ernesto', 'Gus', 'Hank', 'Isaiah', 'Jerome', 'Kenny', 'Lamar', 'Noel', 'Otis', 'Percy', 'Quentin'];
const FIRST_F = ['Maria', 'Shanice', 'Dolores', 'Tammy', 'Clotile', 'Brenda', 'Keisha', 'Rosa', 'Darlene', 'Lynette', 'Yvette', 'Ana', 'Monique', 'Crystal', 'Gloria', 'Josie', 'Latoya', 'Marie', 'Nadine', 'Odette', 'Pearl', 'Renee', 'Sabine', 'Tina', 'Ursula', 'Vera', 'Wanda', 'Ximena', 'Yolanda', 'Zoe', 'Bernadette', 'Celeste', 'Delphine', 'Evangeline', 'Fern', 'Ginger', 'Hattie', 'Imogene', 'Jolene', 'Kay'];
// (no surnames that pair with the first names into someone famous)
const LAST = ['Hebert', 'Thibodeaux', 'Boudreaux', 'Landry', 'Broussard', 'Guidry', 'Fontenot', 'Robichaux', 'LeBlanc', 'Arceneaux', 'Washington', 'Johnson', 'Garcia', 'Martinez', 'Hernandez', 'Lopez', 'Nguyen', 'Tran', 'Smith', 'Davis', 'Miller', 'Wilson', 'Moore', 'Taylor', 'Anderson', 'Thomas', 'White', 'Harris', 'Martin', 'Clark', 'Lewis', 'Walker', 'Hall', 'Young', 'King', 'Wright', 'Scott', 'Green', 'Baker', 'Adams', 'Nelson', 'Carter', 'Mitchell', 'Perez', 'Roberts', 'Phillips', 'Campbell', 'Parker', 'Evans', 'Edwards', 'Collins', 'Stewart', 'Sanchez', 'Morris', 'Reed'];
const JOBS = { office: ['clerk', 'accountant', 'paralegal', 'insurance agent', 'receptionist', 'manager'], store: ['cashier', 'stocker', 'store manager', 'butcher'], bar: ['bartender', 'cook', 'waitress', 'bouncer'], warehouse: ['forklift driver', 'loader', 'dock hand', 'shift supervisor'] };
const OUT_JOBS = ['roofer', 'landscaper', 'mechanic', 'nurse', 'teacher', 'trucker', 'shrimper', 'electrician', 'plumber'];

function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const pickR = (r, a) => a[(r() * a.length) | 0];

// places: [{ i, x, z, nx, nz, kind: 'home'|'apartment'|'office'|'store'|'bar'|'warehouse', area }]
// Returns the town: residents and the places they use.
export function buildTown(places, opts = {}) {
  const N = opts.count ?? 3000, r = rng(opts.seed ?? 1977);
  const homes = places.filter((p) => p.kind === 'home' || p.kind === 'apartment');
  const work = places.filter((p) => p.kind === 'office' || p.kind === 'store' || p.kind === 'warehouse' || p.kind === 'bar');
  const bars = places.filter((p) => p.kind === 'bar');
  if (!homes.length) return { residents: [], places };
  // how many people each home holds: a house 1-5, an apartment block up to 40
  const cap = homes.map((h) => (h.kind === 'apartment' ? 16 + Math.min(80, Math.round(h.area / 12)) : 2 + Math.min(5, Math.round(h.area / 70))));
  const residents = [];
  let hi = 0, guard = 0;
  while (residents.length < N && guard++ < N * 20) {
    const h = homes[hi % homes.length];
    const living = residents.filter((x) => x.home === h.i).length; // (cheap enough at load: households are small)
    if (living < cap[hi % homes.length]) residents.push(makeResident(residents.length, h, work, r));
    hi += 1 + ((r() * 3) | 0);
  }
  // households share a surname often
  const byHome = new Map();
  for (const p of residents) { if (!byHome.has(p.home)) byHome.set(p.home, []); byHome.get(p.home).push(p); }
  for (const [, hh] of byHome) if (hh.length > 1 && hh[0].home && r() < 0.7) for (const p of hh.slice(1)) if (r() < 0.75) { p.last = hh[0].last; p.family = hh[0].id; }
  // friends: 3-6 each, mostly neighbours and workmates, a few from across town
  const near = (a, b) => Math.hypot(a.hx - b.hx, a.hz - b.hz);
  for (const p of residents) {
    const want = 3 + ((r() * 4) | 0);
    let tries = 0;
    while (p.friends.length < want && tries++ < 40) {
      const q = residents[(r() * residents.length) | 0];
      if (q === p || p.friends.includes(q.id) || q.friends.length >= 8) continue;
      const ok = near(p, q) < 260 || (p.work && q.work === p.work) || r() < 0.08;
      if (ok) { p.friends.push(q.id); q.friends.push(p.id); }
    }
  }
  // a favourite bar each (the nearest few to home), for nights out
  for (const p of residents) if (bars.length) { const b = bars.slice().sort((a, b2) => Math.hypot(a.x - p.hx, a.z - p.hz) - Math.hypot(b2.x - p.hx, b2.z - p.hz))[(r() * Math.min(3, bars.length)) | 0]; p.bar = b.i; }
  return { residents, places, byIndex: new Map(places.map((p) => [p.i, p])) };
}

function makeResident(id, home, work, r) {
  const f = r() < 0.5;
  const age = 18 + ((r() * 62) | 0);
  const retired = age > 66, kid = false;
  const employed = !retired && r() < 0.86;
  let job = null, place = null;
  if (employed) {
    if (work.length && r() < 0.78) { place = pickR(r, work); job = pickR(r, JOBS[place.kind] || JOBS.office); }
    else job = pickR(r, OUT_JOBS);
  }
  const early = job && /cook|baker|dock|loader|roofer|landscaper|shrimper|trucker|nurse/.test(job);
  const night = place && place.kind === 'bar';
  const start = (night ? 16 + ((r() * 3) | 0) : early ? 6 + ((r() * 2) | 0) : 8 + ((r() * 2) | 0)) + Math.round(r() * 18) / 20; // not everyone on the hour
  return {
    id, f, first: pickR(r, f ? FIRST_F : FIRST_M), last: pickR(r, LAST), age, kid,
    home: home.i, hx: home.x, hz: home.z, hnx: home.nx, hnz: home.nz,
    job, work: place ? place.i : null, start, end: night ? (start + 8) % 24 : start + 8 + ((r() * 2) | 0),
    wake: employed ? (start - 1 + 24) % 24 : 7 + ((r() * 3) | 0), sleep: night ? 4 : 21 + ((r() * 3) | 0),
    social: r(), // how often they go out
    look: (r() * 1e6) | 0, carry: null, alive: true, friends: [], bar: null, family: null,
  };
}

// What a resident is doing at `hour` on `day` (0 = Monday). Returns { act, at, from?, to?, k? }:
//   at: place index they're in (indoors), or null while travelling / outdoors;
//   from/to + k (0..1): travelling between two place indices.
export function whereIs(p, day, hour, town) {
  if (!p.alive) return { act: 'dead', at: null };
  const weekend = day % 7 >= 5;
  const h = ((hour % 24) + 24) % 24;
  const seed = (p.id * 2654435761 + day * 40503) >>> 0, rr = rng(seed);
  const nightOut = rr() < (weekend ? 0.45 : 0.18) * (0.4 + p.social);
  const outFriend = nightOut && p.friends.length && rr() < 0.4 ? town.residents[p.friends[(rr() * p.friends.length) | 0]] : null;
  const outPlace = outFriend && outFriend.alive ? outFriend.home : p.bar;
  const outStart = 19 + rr() * 2, outEnd = Math.min(outStart + 2 + rr() * 3, 25.5);
  const lunchOut = !weekend && p.work != null && rr() < 0.35;
  const walkT = 0.35; // hours on the way (they walk or drive; near the player they're seen walking)
  const seg = [];
  const add = (a, b, act, at) => seg.push({ a, b, act, at });
  const workDay = !weekend && p.job && p.work != null;
  if (workDay && p.end > p.start) {
    add(0, p.start - walkT, 'home', p.home);
    add(p.start - walkT, p.start, 'commute', null, p.home, p.work);
    if (lunchOut) { add(p.start, 12, 'work', p.work); add(12, 13, 'lunch', null); add(13, p.end, 'work', p.work); } else add(p.start, p.end, 'work', p.work);
    add(p.end, p.end + walkT, 'commute', null);
  } else if (workDay) { // night shift (crosses midnight)
    add(0, p.end, 'work', p.work); add(p.end, p.end + walkT, 'commute', null); add(p.start - walkT, p.start, 'commute', null); add(p.start, 24, 'work', p.work);
  } else {
    // a day off: errands and a walk in the afternoon
    const o = 10 + rr() * 5; add(o, o + 0.6 + rr(), 'errand', null);
  }
  if (nightOut && outPlace != null && !(workDay && p.end <= p.start)) {
    add(outStart - walkT, outStart, 'going out', null);
    // at a bar some of the night is spent outside the door (a smoke, a phone call, the crowd on the pavement)
    if (!outFriend) { const smoke = outStart + 0.4 + rr() * (outEnd - outStart - 0.8); add(outStart, smoke, 'at the bar', outPlace); add(smoke, smoke + 0.3 + rr() * 0.4, 'outside the bar', null); add(smoke + 0.7, outEnd, 'at the bar', outPlace); }
    else add(outStart, outEnd, 'at a friend\'s', outPlace);
    add(outEnd, outEnd + walkT, 'heading home', null);
  } else if (rr() < 0.3 * (0.5 + p.social)) { const st = 17.5 + rr() * 3; add(st, st + 0.4 + rr() * 0.5, 'evening walk', null); }
  for (const s of seg) if (h >= s.a && h < s.b) {
    if (s.at != null) return { act: s.act, at: s.at };
    const from = s.act === 'commute' && h < 12 && p.end > p.start ? p.home : s.act === 'heading home' ? outPlace : s.act === 'going out' ? p.home : s.act === 'commute' ? p.work : p.home;
    const to = s.act === 'commute' && h < 12 && p.end > p.start ? p.work : s.act === 'going out' ? outPlace : s.act === 'commute' || s.act === 'heading home' ? p.home : null;
    return { act: s.act, at: null, from, to, k: (h - s.a) / Math.max(0.01, s.b - s.a) };
  }
  // otherwise at home (asleep at night)
  const asleep = h >= p.sleep || h < p.wake;
  return { act: asleep ? 'asleep' : 'home', at: p.home };
}

// A resident's world position right now (approximate: indoors = at the place's door, inside)
export function residentPos(p, state, town) {
  const P = (i) => town.byIndex.get(i);
  if (state.at != null) { const q = P(state.at); return q ? { x: q.x, z: q.z, indoors: true } : null; }
  if (state.from != null && state.to != null) {
    const a = P(state.from), b = P(state.to); if (!a || !b) return null;
    return { x: a.x + (b.x - a.x) * state.k, z: a.z + (b.z - a.z) * state.k, indoors: false, tx: b.x, tz: b.z };
  }
  if (state.act === 'outside the bar' && p.bar != null) { const q = P(p.bar); if (q) { const a = (p.id * 0.7) % 6.28; return { x: q.x + (q.nx || 0) * 2.5 + Math.cos(a) * 2.2, z: q.z + (q.nz || 0) * 2.5 + Math.sin(a) * 2.2, indoors: false, tx: q.x, tz: q.z, idle: true }; } }
  if (state.act === 'lunch' && p.work != null) { const q = P(p.work); if (q) { const a = (p.id * 0.9) % 6.28, rad = 25 + (p.id % 50); return { x: q.x + Math.cos(a) * rad * (state.k ?? 0.5), z: q.z + Math.sin(a) * rad * (state.k ?? 0.5), indoors: false, tx: q.x + Math.cos(a) * rad, tz: q.z + Math.sin(a) * rad }; } }
  // out and about near home (errands, a walk)
  const ang = ((p.id * 137) % 360) * Math.PI / 180, rad = 40 + (p.id % 80);
  return { x: p.hx + Math.cos(ang) * rad * (state.k ?? 0.5), z: p.hz + Math.sin(ang) * rad * (state.k ?? 0.5), indoors: false, tx: p.hx + Math.cos(ang) * rad, tz: p.hz + Math.sin(ang) * rad };
}

export const fullName = (p) => `${p.first} ${p.last}`;
