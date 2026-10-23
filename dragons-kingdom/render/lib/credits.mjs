// End credits: credits.txt -> a scrolling credits card (render/episode.mjs, END scene).
//
// The look: role headings small, in capitals and letter-spaced, in a muted warm grey; names larger, in
// warm white; the series title on top. One pinned font everywhere (EB Garamond, OFL; render/lib/fonts.mjs),
// so the card is the same on every computer.
//
// No judder: the whole roll is drawn ONCE as a still image (every line at a whole-pixel position), and that
// image moves up by the same WHOLE number of pixels on every frame (overlay y = y0 - n * S). The speed S is
// the smallest whole number that gets the roll through the card's length; the slack is split as black
// before the first and after the last line.
//
// credits.txt format: blocks separated by blank lines. The first block is the title (its first line big, the
// rest smaller). In every other block the first line is the role heading and the following lines are names;
// a block of one line is a name line. Two or more blank lines = a larger gap (a new section).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { ffmpegPath } from './tools.mjs';

// sizes in pixels at 2160 lines (scaled to the output height), colours, line heights (x size)
export const STYLE = {
  title: { size: 128, font: 'medium', color: '0xF3EEE3', lead: 1.25 },
  subtitle: { size: 56, font: 'regular', color: '0xD9D2C3', lead: 1.45 },
  role: { size: 38, font: 'medium', color: '0xA79E8A', lead: 1.75, caps: true, track: true },
  name: { size: 62, font: 'regular', color: '0xF3EEE3', lead: 1.32 },
};
const GAP_BLOCK = 0.95, GAP_SECTION = 2.6;   // x name size

/** credits.txt -> [{ style, text, gapBefore (blank lines) }] */
export function parseCredits(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n').map((l) => l.replace(/\s+$/, ''));
  const blocks = [];
  let cur = null, blanks = 0;
  for (const l of lines) {
    if (!l.trim()) { if (cur) { blocks.push(cur); cur = null; } blanks++; continue; }
    if (!cur) { cur = { gap: blocks.length ? blanks : 0, lines: [] }; blanks = 0; }
    cur.lines.push(l.trim());
  }
  if (cur) blocks.push(cur);
  const out = [];
  blocks.forEach((b, bi) => {
    b.lines.forEach((t, li) => {
      const style = bi === 0 ? (li === 0 ? 'title' : 'subtitle') : (b.lines.length > 1 && li === 0 ? 'role' : 'name');
      out.push({ style, text: t, gapBefore: li === 0 ? b.gap : 0 });
    });
  });
  return out;
}

/** Letter-spaced capitals for headings: a hair space between letters, a wider gap between words. */
export const tracked = (s) => s.toUpperCase().split(' ').map((w) => [...w].join('\u200A')).join('\u2002');

/** Whole-pixel layout: [{ ...item, size, baseline }] and the roll height. */
export function layoutCredits(items, H) {
  const k = H / 2160;
  const name = STYLE.name.size * k;
  let y = 0;
  const out = [];
  let prev = null;
  for (const it of items) {
    const st = STYLE[it.style];
    const size = Math.max(6, Math.round(st.size * k));
    if (prev) {
      y += prev.lead;                                            // the previous line's own line height
      if (it.gapBefore === 1) y += GAP_BLOCK * name;
      else if (it.gapBefore >= 2) y += GAP_SECTION * name;
    } else y += size;                                            // first baseline: one line down
    const baseline = Math.round(y);
    out.push({ ...it, size, baseline, color: st.color, font: st.font, text: st.caps ? tracked(it.text) : it.text });
    prev = { lead: size * st.lead };
  }
  const rollH = Math.round(y + (prev ? prev.lead : 0)) + 2;
  return { items: out, rollH: rollH + (rollH % 2) };
}

/** The scroll: whole pixels per frame (S) and the start offset y0 (top of the roll at frame 0). */
export function scrollPlan({ H, rollH, frames }) {
  const need = H + rollH;                       // from just below the frame to just above it
  const S = Math.max(1, Math.ceil(need / Math.max(1, frames - 1)));
  const slack = S * (frames - 1) - need;        // >= 0: black before the first line and after the last
  const y0 = H + Math.floor(slack / 2);
  return { S, y0, firstVisible: Math.ceil((y0 - H) / S), lastVisible: Math.floor((y0 + rollH) / S) };
}

const esc = (p) => `'${p.replace(/\\/g, '/').replace(/'/g, "'\\''").replace(/:/g, '\\:')}'`;

/**
 * Draw the roll (one still, W x rollH, black) with ffmpeg drawtext. Runs in a temp folder with short relative
 * file names so the filter stays far below the Windows command-line limit. Returns { png, rollH, items }.
 */
export function drawRoll({ text, W, H, fonts, workDir }) {
  const items = parseCredits(text);
  const { items: laid, rollH } = layoutCredits(items, H);
  fs.mkdirSync(workDir, { recursive: true });
  fs.copyFileSync(fonts.regular, path.join(workDir, 'r.ttf'));
  fs.copyFileSync(fonts.medium, path.join(workDir, 'm.ttf'));
  const filters = laid.map((it, i) => {
    fs.writeFileSync(path.join(workDir, `l${i}.txt`), it.text);
    return `drawtext=fontfile=${it.font === 'medium' ? 'm.ttf' : 'r.ttf'}:textfile=l${i}.txt:expansion=none:fontsize=${it.size}:fontcolor=${it.color}:x=(w-text_w)/2:y=${it.baseline}-ascent`;
  });
  const png = path.join(workDir, 'roll.png');
  const r = spawnSync(ffmpegPath(), ['-hide_banner', '-loglevel', 'error', '-y', '-nostdin', '-f', 'lavfi', '-i', `color=c=black:s=${W}x${rollH}:d=1`,
    '-vf', filters.join(','), '-frames:v', '1', 'roll.png'], { cwd: workDir, encoding: 'utf8', windowsHide: true, maxBuffer: 16 << 20 });
  if (r.status !== 0 || !fs.existsSync(png)) throw new Error(`the credits roll could not be drawn: ${(r.stderr || '').trim().split('\n').slice(-2).join(' ')}`);
  return { png, rollH, items: laid };
}

/** ffmpeg arguments (inputs + filter) for the card: the roll scrolling over black, S whole pixels per frame. */
export function scrollArgs({ png, W, H, rollH, frames, fps }) {
  const p = scrollPlan({ H, rollH, frames });
  return {
    plan: p,
    args: ['-f', 'lavfi', '-i', `color=c=black:s=${W}x${H}:r=${fps}`, '-loop', '1', '-framerate', String(fps), '-i', png,
      '-filter_complex', `[0:v][1:v]overlay=x=0:y=${p.y0}-n*${p.S}:eval=frame:format=yuv444[v]`, '-map', '[v]', '-frames:v', String(frames)],
  };
}

export const tmpDir = (tag) => fs.mkdtempSync(path.join(os.tmpdir(), `dk-credits-${tag}-`));
export { esc as ffEsc };
