// Subtitles for the episode: SRT read/write and ESTIMATED cue timing from the
// shot list when no timed subtitle file (from the sound mix) exists yet.
//
// Estimated timing: every shot's dialogue lines (final/shotlist.json) are
// spoken in order from 0.25 s after the shot starts, each for its
// `line_seconds` (the speech-timing model of final/dialogue.json, at least
// `subtitle_min_seconds`); a line with several `subtitle_cues` is split by
// text length. Cues never overlap. The text always comes from dialogue.json,
// so a changed line (e.g. a creator-approved rewrite) appears as soon as
// dialogue.json has it. Real timings (word timings of the recorded voices)
// replace these as soon as a timed .srt is supplied (see episode.mjs).
import fs from 'node:fs';

const LEAD_S = 0.25, GAP_S = 0.12, MIN_CUE_S = 0.8, MIN_GAP_S = 0.05;

const pad = (n, w = 2) => String(n).padStart(w, '0');
export function srtTime(s) {
  const ms = Math.max(0, Math.round(s * 1000));
  return `${pad(Math.floor(ms / 3600000))}:${pad(Math.floor(ms / 60000) % 60)}:${pad(Math.floor(ms / 1000) % 60)},${pad(ms % 1000, 3)}`;
}
export function parseSrtTime(t) {
  const m = /(\d+):(\d+):(\d+)[,.](\d+)/.exec(t);
  return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4].padEnd(3, '0').slice(0, 3) / 1000 : null;
}

export function writeSrt(file, cues) {
  const body = cues.map((c, i) => `${i + 1}\n${srtTime(c.start)} --> ${srtTime(c.end)}\n${c.text}\n`).join('\n');
  fs.writeFileSync(file, body);
}

export function readSrt(file) {
  const txt = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r/g, '');
  const cues = [];
  for (const block of txt.split(/\n\s*\n/)) {
    const lines = block.split('\n').filter((l) => l.length);
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) continue;
    const [a, b] = lines[ti].split('-->');
    const start = parseSrtTime(a), end = parseSrtTime(b);
    if (start == null || end == null) continue;
    cues.push({ start, end, text: lines.slice(ti + 1).join('\n') });
  }
  return cues;
}

/** Cues inside [from, to) seconds, shifted so `from` becomes 0 (clipped at both ends). */
export function sliceCues(cues, from, to) {
  return cues.filter((c) => c.end > from && c.start < to)
    .map((c) => ({ ...c, start: Math.max(0, c.start - from), end: Math.min(to, c.end) - from }))
    .filter((c) => c.end - c.start >= 0.2);
}

/**
 * Estimated episode cues.
 * jobs: render-jobs.json jobs in episode order ({ job, frames }); shots: shotlist.json shots
 * ({ id, dialogue: [{ id, line_seconds }] }); lines: dialogue.json lines ({ id, text, subtitle_cues,
 * subtitle_min_seconds, est_seconds }). Returns [{ start, end, text, line, shot }] in seconds.
 */
export function estimateCues({ jobs, shots, lines, fps = 24 }) {
  const byShot = new Map(shots.map((s) => [s.id, s]));
  const byLine = new Map(lines.map((l) => [l.id, l]));
  const cues = [];
  const said = new Set();     // a line that runs over a cut is listed in both shots: subtitle it once
  let frame = 0;
  for (const j of jobs) {
    const shotStart = frame / fps;
    frame += j.frames;
    const shot = byShot.get(j.job);
    if (!shot?.dialogue?.length) continue;
    let t = shotStart + LEAD_S;
    for (const d of shot.dialogue) {
      const line = byLine.get(d.id);
      if (!line || said.has(d.id)) continue;
      said.add(d.id);
      const texts = (line.subtitle_cues?.length ? line.subtitle_cues : [line.text]).map((x) => String(x).trim()).filter(Boolean);
      const dur = Math.max(d.line_seconds ?? line.est_seconds ?? 1, line.subtitle_min_seconds ?? 0, MIN_CUE_S * texts.length);
      const total = texts.reduce((a, x) => a + x.length, 0) || 1;
      let u = t;
      for (const x of texts) {
        const len = Math.max(MIN_CUE_S, (dur * x.length) / total);
        cues.push({ start: u, end: u + len, text: x, line: d.id, shot: j.job });
        u += len;
      }
      t = u + GAP_S;      // a shot's last line may run over the cut (normal); overlaps are trimmed below
    }
  }
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i + 1 < cues.length; i++) {
    const a = cues[i], b = cues[i + 1];
    if (a.end > b.start - MIN_GAP_S) a.end = Math.max(a.start + 0.3, b.start - MIN_GAP_S);
    if (b.start < a.end) b.start = a.end + MIN_GAP_S;
    if (b.end < b.start + 0.3) b.end = b.start + 0.3;
  }
  const endS = frame / fps;
  return cues.filter((c) => c.start < endS).map((c) => ({ ...c, end: Math.min(c.end, endS) }));
}
