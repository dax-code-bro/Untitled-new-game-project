// Shared sound data for episodes without hand-made sound sheets (engine phase 6):
//   bedTable(beds)            the bed table with a set-variant fallback (CLING_SQUARE_2 -> CLING_SQUARE)
//   autoSpots(ep, edl, lib)   spot events from the shot list's `sound:` field, where a word names a synthesised sound
// Episode 1 has its own beds.json / spots.json and never reaches autoSpots; bedTable only adds a fallback for set ids
// the table lacks, so Episode 1's mixes are unchanged.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirs } from '../director/episode-paths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SOUND_WORDS_FILE = path.join(HERE, 'sound-words.json');

/** beds.json with `sets` answering a variant id (X_2, X_3) by its base set when it has no entry of its own */
export function bedTable(beds) {
  const sets = beds.sets || {};
  return { ...beds, sets: new Proxy(sets, { get: (o, k) => (typeof k === 'string' && !(k in o) && /_\d+$/.test(k) ? o[k.replace(/_\d+$/, '')] : o[k]) }) };
}

const seedOf = (s) => parseInt(crypto.createHash('sha1').update(s).digest('hex').slice(0, 6), 16) % 9973;

/** { defaults, space_of_set, spaces, events, unmatched } for the mixer's fx stem. `lib`: a spot sheet whose
 *  defaults / spaces / space_of_set are used (Episode 1's). Words in sound-words.json, first match wins per phrase. */
export function autoSpots(ep, edl, lib) {
  const words = JSON.parse(fs.readFileSync(SOUND_WORDS_FILE, 'utf8')).words;
  const D = dirs(ep);
  const rows = new Map((JSON.parse(fs.readFileSync(D.shotlist, 'utf8')).shots || []).map((r) => [r.id, r]));
  const events = [], unmatched = [];
  const FPS = edl.fps || 24;
  for (const s of edl.shots) {
    const row = rows.get(s.job);
    if (!row?.sound) continue;
    const len = (s.rec_out - s.rec_in) / FPS;
    for (const phrase of String(row.sound).split(';').map((x) => x.trim()).filter(Boolean)) {
      const w = words.find((x) => new RegExp(x.re, 'i').test(phrase));
      if (!w) { unmatched.push(`${s.job} "${phrase}"`); continue; }
      const n = w.repeat_every_s ? Math.max(1, Math.floor((len - (w.at ?? 0.4)) / w.repeat_every_s)) : 1;
      events.push({ shot: s.job, at: Math.min(w.at ?? 0.4, Math.max(0, len - 0.5)), sound: w.sound, gain_db: w.gain_db ?? -28, pan: w.pan ?? 0, seed: seedOf(`${ep} ${s.job} ${phrase}`),
        ...(w.params ? { params: w.params } : {}), ...(n > 1 ? { repeat: { n, every_s: w.repeat_every_s, jitter_s: 0.3 } } : {}), note: `auto: sound "${phrase}"` });
    }
  }
  const space_of_set = { ...(lib.space_of_set || {}) };
  for (const s of edl.shots) if (s.set && !(s.set in space_of_set) && /_\d+$/.test(s.set) && space_of_set[s.set.replace(/_\d+$/, '')]) space_of_set[s.set] = space_of_set[s.set.replace(/_\d+$/, '')];
  return { defaults: lib.defaults, space_of_set, spaces: lib.spaces, events, unmatched };
}
