// The residents of Calvera in the world (systems/residents.js has their lives).
//
// Every half second the town is checked: whoever's day has them outdoors near the player (walking
// to work, out on an errand, heading to a friend's, smoking outside a bar) is made into a real
// person on the pavement, walking where they're really going, block by block along the sidewalks,
// and through their own front door at the end of it. Friends who run into each other stop and talk.
// Walk up to one and you can say hello (F): they're a name, a job and a day, not a random face.
// Killing one is for good. Twenty minutes later someone new moves into their place.
import * as THREE from 'three';
import { Human, locomotion } from '../entities/human.js';
import { buildTown, whereIs, residentPos, fullName } from './residents.js';
import { CITY, TOWN, regionAt } from '../world/layout.js';
import { keyHint } from './world-util.js';

const NEAR = 135, NEWCOMER_MS = 20 * 60 * 1000;
const CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const cornerXZ = (G, i, j, c) => { const cx = G.x0 + (i + 0.5) * G.pitch, cz = G.z0 + (j + 0.5) * G.pitch, half = (G.pitch - G.street) / 2 - 1.7; return [cx + CORNERS[c][0] * half, cz + CORNERS[c][1] * half]; };
const gridAt = (x, z) => { for (const G of [CITY, TOWN]) { const i = Math.floor((x - G.x0) / G.pitch), j = Math.floor((z - G.z0) / G.pitch); if (i >= 0 && j >= 0 && i < G.nx && j < G.nz) return { G, i, j }; } return null; };

export function installPopulation(game) {
  const { peds, estate, career, hud, player, lib, S } = game;
  const places = estate.doors.map((d) => ({ i: d.i, x: d.x, z: d.z, nx: d.nx, nz: d.nz, kind: estate.kindOf(d), area: d.b.w * d.b.d }));
  const town = buildTown(places, { count: 3000, seed: 1977 });
  const R = town.residents;
  // who carries: a little more out of the city (same odds as the street-crime roll)
  for (const r of R) {
    const reg = regionAt(r.hx, r.hz), city = reg.sub === 'City' || reg.sub === 'Town';
    const x = ((r.id * 2654435761) >>> 0) / 4294967296;
    r.carry = city ? (x < 0.08 ? 'pistol' : x < 0.12 ? 'switchblade' : null) : (x < 0.2 ? 'pistol' : x < 0.27 ? 'hunting_knife' : null);
  }
  // the dead stay dead (and newcomers stay moved in) across saves
  const P = career.p;
  P.residents = P.residents || { dead: {}, gen: {} };
  const renew = (r) => { // someone new in this slot: a new identity, the same home
    const g = (P.residents.gen[r.id] || 0);
    const t2 = buildTown([{ ...places.find((q) => q.i === r.home), kind: 'home', area: 100 }, ...places.filter((q) => q.kind !== 'home' && q.kind !== 'apartment').slice(0, 60)], { count: 1, seed: 1977 + r.id * 31 + g * 7919 }).residents[0];
    if (t2) Object.assign(r, { ...t2, id: r.id, home: r.home, hx: r.hx, hz: r.hz, friends: r.friends, alive: true, newcomer: true, bar: r.bar, look: t2.look });
  };
  for (const id of Object.keys(P.residents.gen)) if (R[+id]) renew(R[+id]);
  for (const id of Object.keys(P.residents.dead)) if (R[+id]) R[+id].alive = false;

  const out = new Map(); // resident id -> ped
  let scanT = 0, newT = 0;
  const pending = []; // residents about to step out, made one a frame

  // ---- a resident on the pavement
  const realize = (r, pos) => {
    // on the town grid they appear on the nearest street corner of the block they're passing (not
    // inside it); out of town, where their way is
    const cell = gridAt(pos.x, pos.z);
    if (cell) { let bd = 1e9, b = null; for (let c = 0; c < 4; c++) { const q = cornerXZ(cell.G, cell.i, cell.j, c); const d = Math.hypot(q[0] - pos.x, q[1] - pos.z); if (d < bd) { bd = d; b = q; } } pos = { ...pos, x: b[0], z: b[1] }; }
    const id = lib.peopleIds[r.look % lib.peopleIds.length];
    const h = new Human(lib, id);
    const p = peds.spawnAt(pos.x, pos.z, null, h);
    if (!p) return null;
    p.role = 'resident'; p.resident = r; p.mode = 'walk';
    p.speed = 1.15 + ((r.id * 7) % 10) * 0.05;
    p.carry = r.carry; p.carryRolled = true;
    p.heading = Math.atan2((pos.tx ?? pos.x) - pos.x, (pos.tz ?? pos.z) - pos.z);
    setGoal(p, pos);
    out.set(r.id, p);
    return p;
  };
  const setGoal = (p, pos) => {
    p.goal = pos.tx !== undefined ? { x: pos.tx, z: pos.tz, door: !pos.idle } : null;
    p.loiter = !!pos.idle;
  };

  // walking somewhere along the sidewalks: block corner to block corner, crossing towards the goal
  peds.residentThink = (p, dt, pl) => {
    const g = p.goal;
    if (p.loiter || !g) { p.h.play('Idle_Talking_Loop', 0.3); p.h.root.rotation.y = p.heading; return; }
    if (p.chat > 0) { p.chat -= dt; p.h.play('Idle_Talking_Loop', 0.3); return; }
    const dx = g.x - p.pos.x, dz = g.z - p.pos.z, dGoal = Math.hypot(dx, dz);
    let tx, tz;
    const cell = gridAt(p.pos.x, p.pos.z);
    if (dGoal < 26 || !cell) { tx = g.x; tz = g.z; } // the last stretch (or out of town): straight there
    else {
      if (!p.wp || Math.hypot(p.wp[0] - p.pos.x, p.wp[1] - p.pos.z) < 0.7) p.wp = nextCorner(p, cell, g);
      [tx, tz] = p.wp;
    }
    const ex = tx - p.pos.x, ez = tz - p.pos.z, d = Math.hypot(ex, ez);
    if (dGoal < 0.9 && g.door) { goInside(p); return; }
    if (d > 0.05) p.heading += Math.atan2(Math.sin(Math.atan2(ex, ez) - p.heading), Math.cos(Math.atan2(ex, ez) - p.heading)) * Math.min(1, dt * 5);
    const sp = p.speed;
    p.pos.x += Math.sin(p.heading) * sp * dt; p.pos.z += Math.cos(p.heading) * sp * dt;
    if (!cell || dGoal < 26) { const r = game.collision.resolve(p.pos.x, p.pos.z, 0.35, p.pos.y, 1.8); p.pos.x = r.x; p.pos.z = r.z; }
    p.pos.y = game.collision.surface(p.pos.x, p.pos.z, p.pos.y + 0.5);
    const [clip, cs] = locomotion(sp); p.h.play(clip, 0.25, cs);
    if (pl) { const ax = p.pos.x - pl.x, az = p.pos.z - pl.z, ad = Math.hypot(ax, az); if (ad < 0.7 && ad > 1e-3) { p.pos.x += (ax / ad) * (0.7 - ad); p.pos.z += (az / ad) * (0.7 - ad); } }
  };
  // the corner (of this block, or across the street) that gets them closest to where they're going
  function nextCorner(p, cell, g) {
    const { G, i, j } = cell;
    let best = null, bd = 1e9;
    for (let c = 0; c < 4; c++) {
      const [x, z] = cornerXZ(G, i, j, c);
      const d = Math.hypot(g.x - x, g.z - z) + Math.hypot(x - p.pos.x, z - p.pos.z) * 0.15;
      if (d < bd) { bd = d; best = [x, z]; }
    }
    // standing on the best corner already: cross to the neighbouring block that's nearer the goal
    if (Math.hypot(best[0] - p.pos.x, best[1] - p.pos.z) < 1.2) {
      const sx = Math.sign(g.x - p.pos.x), sz = Math.sign(g.z - p.pos.z);
      const viaX = Math.abs(g.x - p.pos.x) > Math.abs(g.z - p.pos.z);
      const ni = i + (viaX ? sx : 0), nj = j + (viaX ? 0 : sz);
      if (ni >= 0 && nj >= 0 && ni < G.nx && nj < G.nz) {
        let nb = null, nd = 1e9;
        for (let c = 0; c < 4; c++) { const [x, z] = cornerXZ(G, ni, nj, c); const dd = Math.hypot(x - p.pos.x, z - p.pos.z); if (dd < nd) { nd = dd; nb = [x, z]; } }
        return nb;
      }
      return [g.x, g.z];
    }
    return best;
  }
  function goInside(p) {
    out.delete(p.resident.id);
    const k = peds.list.indexOf(p);
    if (k >= 0) { game.scene.remove(p.h.root); p.h.dispose(); peds.list.splice(k, 1); }
    if (p.gun) { game.scene.remove(p.gun); p.gun = null; }
  }

  // deaths are for good
  const prevDeath = peds.onDeath;
  peds.onDeath = (p, from, info) => {
    prevDeath?.(p, from, info);
    const r = p.resident; if (!r || !r.alive) return;
    r.alive = false; P.residents.dead[r.id] = Date.now(); out.delete(r.id);
    career.saveSoon?.();
    // friends nearby take it hard
    for (const fid of r.friends) { const f = out.get(fid); if (f && f.pos.distanceTo(p.pos) < 40 && f.mode !== 'dead') { f.mode = 'flee'; f.threat = p.pos.clone(); f.timer = 12; } }
  };

  const LINES = {
    commute: ['"Morning. Running late."', '"Can\'t stop — shift starts in ten."', '"Another day, another dollar."'],
    work: ['"On my break. Don\'t tell my boss."'],
    lunch: ['"Lunch. Thirty minutes of freedom."', '"You eaten? The po\'boy place on the corner\'s good."'],
    errand: ['"Just picking up a few things."', '"Hot one today, huh?"', '"Hey there."'],
    'going out': ['"Meeting some friends. You have a good night."', '"Finally, the weekend."'],
    'outside the bar': ['"You want a smoke? No? Suit yourself."', '"It\'s loud in there tonight."', '"Buy you a drink?"'],
    'heading home': ['"Long night. Heading home."', '"Don\'t mind me, I\'m fine. I\'m fine."'],
    'evening walk': ['"Nice night for it."', '"Evening."', '"Mosquitoes are bad tonight."'],
  };
  const greet = (p) => {
    const r = p.resident, st = whereIs(r, game.sky.day, game.sky.hour, town);
    const scared = game.police?.wanted > 0 || game.combat?.drawn;
    const line = scared ? '"I don\'t want any trouble, man."' : (LINES[st.act] || LINES.errand)[(r.id + Math.floor(game.sky.hour)) % (LINES[st.act] || LINES.errand).length];
    hud.toast(`${fullName(r)}${r.job ? `, ${r.job}` : ''}: ${line}`, 3.2);
    if (!scared) game.addContact?.(r); // they give you their number (systems/phoneplus.js)
    p.chat = 2.5; p.heading = Math.atan2(player.pos.x - p.pos.x, player.pos.z - p.pos.z);
  };

  return {
    town,
    get realized() { return out.size; }, get alive() { return R.filter((r) => r.alive).length; },
    find: (name) => R.find((r) => fullName(r).toLowerCase() === name.toLowerCase()),
    whereIs: (r) => whereIs(r, game.sky.day, game.sky.hour, town),
    // who's in this building right now (by their day), e.g. a house you've broken into
    atHome: (doorIndex) => R.filter((r) => r.alive && r.home === doorIndex && whereIs(r, game.sky.day, game.sky.hour, town).at === doorIndex),
    fullName,
    stats() { // (tests) how many are out, and how many near
      const fx = player.pos.x, fz = player.pos.z; let out_ = 0, near = 0, band = 0;
      for (const r of R) { if (!r.alive) continue; const pos = residentPos(r, whereIs(r, game.sky.day, game.sky.hour, town), town); if (!pos || pos.indoors) continue; out_++; const d = Math.hypot(pos.x - fx, pos.z - fz); if (d < NEAR) near++; if (d < NEAR && d >= 35) band++; }
      return { residents: R.length, outdoors: out_, near, band, realized: out.size, day: game.sky.day, hour: game.sky.hour, indoors: !!S.indoors };
    },
    update(dt, a, free) {
      // newcomers move in twenty minutes after a death
      if ((newT -= dt) <= 0) {
        newT = 5;
        const now = Date.now();
        for (const [id, t] of Object.entries(P.residents.dead)) if (now - t >= NEWCOMER_MS && R[+id]) {
          delete P.residents.dead[id]; P.residents.gen[id] = (P.residents.gen[id] || 0) + 1; renew(R[+id]);
          if (Math.hypot(R[+id].hx - player.pos.x, R[+id].hz - player.pos.z) < 300) hud.toast(`Someone new has moved in on the block: ${fullName(R[+id])}.`, 3);
          career.saveSoon?.();
        }
      }
      if (S.indoors) return '';
      // one new person a frame: building one (a copy of a skinned model) takes a few ms, and three
      // in the same frame was a 10-15 ms stall
      if (pending.length) { const [r, pos] = pending.shift(); if (r.alive && !out.has(r.id)) realize(r, pos); }
      if ((scanT -= dt) <= 0) {
        scanT = 0.5;
        const fx = player.pos.x, fz = player.pos.z, day = game.sky.day, hour = game.sky.hour;
        // gone from the street (out of range, or despawned): back to living off-screen
        for (const [id, p] of out) if (!peds.list.includes(p)) out.delete(id);
        const room = Math.max(0, Math.round(peds.max * 0.75) - out.size);
        let added = 0;
        for (const r of R) {
          if (!r.alive) continue;
          const st = whereIs(r, day, hour, town), pos = residentPos(r, st, town);
          const p = out.get(r.id);
          if (p) { if (pos && !pos.indoors) setGoal(p, pos); else if (p.goal) p.goal.door = true; continue; } // indoors now: they head in
          if (!pos || pos.indoors || added >= Math.min(3, room)) continue;
          const d = Math.hypot(pos.x - fx, pos.z - fz);
          if (d > NEAR || d < 35) continue; // (never pop into existence right next to you)
          if (!pending.some(([q]) => q === r)) { pending.push([r, pos]); added++; }
        }
        // friends who meet stop for a word
        for (const p of out.values()) {
          if (p.chat > 0 || p.mode !== 'walk') continue;
          for (const fid of p.resident.friends) { const q = out.get(fid); if (q && !(q.chat > 0) && q.mode === 'walk' && q.pos.distanceTo(p.pos) < 6 && !p.metAt?.[fid]) { p.metAt = { ...(p.metAt || {}), [fid]: 1 }; q.metAt = { ...(q.metAt || {}), [p.resident.id]: 1 }; p.chat = q.chat = 6 + Math.random() * 8; p.heading = Math.atan2(q.pos.x - p.pos.x, q.pos.z - p.pos.z); q.heading = p.heading + Math.PI; break; } }
        }
      }
      // say hello (F) to the resident right in front of you
      if (S.mode !== 'foot') return '';
      let near = null, nd = 2.4;
      for (const p of out.values()) { if (p.mode === 'dead') continue; const d = p.pos.distanceTo(player.pos); if (d < nd) { nd = d; near = p; } }
      if (!near) return '';
      if (free && a?.enter) { a.enter = false; greet(near); return ''; }
      return `${keyHint(game)} say hello to ${fullName(near.resident)}`;
    },
  };
}
void THREE;
