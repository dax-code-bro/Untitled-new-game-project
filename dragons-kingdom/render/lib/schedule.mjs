// Reading the episode render plan: render-schedule.md (scene order, the
// per-scene hours) and render-jobs.json (one job per shot) next to it.
// Used by render/gpu-check.mjs (time estimate) and render/episode.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { PROJECT_ROOT } from './tools.mjs';

export const DEFAULT_SCHEDULE = path.join(PROJECT_ROOT, 'episodes', 's01e01', 'final', 'render-schedule.md');

const num = (s) => {
  const t = String(s ?? '').replace(/[*,\s]/g, '');
  return t === '' || t === '-' ? null : Number(t);
};
const range = (s) => {
  const m = /^\s*([\d.,]+)\s*-\s*([\d.,]+)\s*$/.exec(String(s ?? '').replace(/\*/g, ''));
  return m ? [num(m[1]), num(m[2])] : null;
};
const mmss = (s) => {
  const m = /^(\d+):(\d\d)$/.exec(String(s ?? '').trim());
  return m ? +m[1] * 60 + +m[2] : null;
};

/** Every markdown table in md: { header: [..], rows: [[..], ..], line } */
export function markdownTables(md) {
  const lines = md.split(/\r?\n/);
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1] || '')) continue;
    const cells = (l) => l.trim().replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
    const t = { header: cells(lines[i]), rows: [], line: i + 1 };
    for (i += 2; i < lines.length && /^\s*\|/.test(lines[i]); i++) t.rows.push(cells(lines[i]));
    out.push(t);
    i--;
  }
  return out;
}

/**
 * Parse render-schedule.md.
 * Returns { file, scenes: [{ n, key, title, startS, lengthS, shots, jobs, frames, meanSpf, renderH, rangeH, wallH, days }],
 *           sets: [{ set, shots, frames, spf, hours, basis }], totals }
 * key = the scene id before the first ':' ("PROLOGUE+TITLE", "1A", ... "END").
 */
export function parseSchedule(file = DEFAULT_SCHEDULE) {
  const md = fs.readFileSync(file, 'utf8');
  const tables = markdownTables(md);
  const col = (t, re) => t.header.findIndex((h) => re.test(h));
  const sceneT = tables.find((t) => col(t, /^#$/) === 0 && col(t, /^scene$/i) >= 0);
  if (!sceneT) throw new Error(`${file}: no "| # | Scene | ..." table (the per-scene delivery order)`);
  const c = {
    n: col(sceneT, /^#$/), scene: col(sceneT, /^scene$/i), start: col(sceneT, /^starts?$/i), len: col(sceneT, /^length$/i),
    shots: col(sceneT, /shots/i), frames: col(sceneT, /^frames$/i), spf: col(sceneT, /s\/frame/i),
    render: col(sceneT, /^render h/i), range: col(sceneT, /^range h/i), wall: col(sceneT, /^wall h/i), days: col(sceneT, /^days$/i),
  };
  const scenes = [];
  let totals = null;
  for (const r of sceneT.rows) {
    const label = r[c.scene] || '';
    if (/\*\*total\*\*/i.test(label) || /\*\*total\*\*/i.test(r.join('|'))) {
      totals = { frames: num(r[c.frames]), renderH: num(r[c.render]), rangeH: range(r[c.range]), wallH: num(r[c.wall]), days: num(r[c.days]) };
      continue;
    }
    if (!num(r[c.n])) continue;
    const i = label.indexOf(':');
    const sj = String(r[c.shots] || '').split('/').map((x) => num(x));
    scenes.push({
      n: num(r[c.n]), key: (i >= 0 ? label.slice(0, i) : label).trim(), title: (i >= 0 ? label.slice(i + 1) : '').trim(),
      startS: mmss(r[c.start]), lengthS: mmss(r[c.len]), shots: sj[0] ?? null, jobs: sj[1] ?? null,
      frames: num(r[c.frames]), meanSpf: num(r[c.spf]), renderH: num(r[c.render]), rangeH: range(r[c.range]),
      wallH: num(r[c.wall]), days: num(r[c.days]),
    });
  }
  const setT = tables.find((t) => /^set$/i.test(t.header[0]) && col(t, /s per 4k frame/i) >= 0);
  const sets = [];
  if (setT) {
    const s = { shots: col(setT, /^shots$/i), frames: col(setT, /^frames$/i), spf: col(setT, /s per 4k frame/i), hours: col(setT, /^hours/i), basis: col(setT, /^basis$/i) };
    for (const r of setT.rows) {
      if (/total/i.test(r[0])) continue;
      sets.push({ set: r[0], shots: num(r[s.shots]), frames: num(r[s.frames]), spf: num(r[s.spf]), hours: num(r[s.hours]), basis: r[s.basis] || '' });
    }
  }
  return { file, scenes, sets, totals };
}

/** render-jobs.json next to the schedule (or the given file). Returns { file, meta, jobs } */
export function loadJobs(scheduleFile = DEFAULT_SCHEDULE, jobsFile) {
  const file = jobsFile || path.join(path.dirname(scheduleFile), 'render-jobs.json');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const jobs = (j.jobs || []).slice().sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  return { file, meta: j.meta || {}, jobs };
}

/** Parse a render.mjs command line from render-jobs.json into { scene, args: {name: value|true}, placeholders: [...] } */
export function parseCommand(cmd) {
  if (!cmd) return null;
  const toks = cmd.match(/<[^>]*>|"[^"]*"|\S+/g) || [];
  const i = toks.findIndex((t) => /render\.mjs$/.test(t));
  if (i < 0) return null;
  const rest = toks.slice(i + 1);
  const out = { scene: null, args: {}, placeholders: [] };
  for (let k = 0; k < rest.length; k++) {
    const t = rest[k];
    if (t.startsWith('--')) {
      const v = rest[k + 1];
      if (v === undefined || v.startsWith('--')) out.args[t.slice(2)] = true;
      else { out.args[t.slice(2)] = v.replace(/^"|"$/g, ''); k++; if (/^</.test(v)) out.placeholders.push(t.slice(2)); }
    } else if (!out.scene) out.scene = t.replace(/^"|"$/g, '');
  }
  return out;
}
