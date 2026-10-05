// Cached benchmark results (written by render/bench.mjs, read by --workers auto).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { PROJECT_ROOT } from './tools.mjs';

export const TUNING_FILE = process.env.DK_TUNING_FILE || path.join(PROJECT_ROOT, '.dk-tuning.json');

export function machineId() {
  const c = os.cpus();
  return `${c[0]?.model?.trim() || 'cpu'} x${c.length}`;
}

export function tuningKey(p, aa, gpu) {
  return `${p.name}:${p.renderWidth}x${p.renderHeight}->${p.width}x${p.height}:${aa}:${gpu ? 'gpu' : 'cpu'}`;
}

export function readTuning() {
  try { return JSON.parse(fs.readFileSync(TUNING_FILE, 'utf8')); } catch { return {}; }
}

export function lookupTuning(key) {
  const t = readTuning()[key];
  if (!t || t.machine !== machineId()) return null;
  return t;
}

export function writeTuning(key, entry) {
  const all = readTuning();
  all[key] = { ...entry, machine: machineId(), measuredAt: new Date().toISOString() };
  fs.writeFileSync(TUNING_FILE, JSON.stringify(all, null, 2) + '\n');
}
