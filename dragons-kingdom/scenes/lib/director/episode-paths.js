// Shot director - EPISODE PATHS (Node only): every per-episode folder and file the director tools and
// the engine use, from one episode id. Engine phase 1 (engine/DESIGN.md section 0, 6): the tools took
// `episodes/s01e01/final` as a constant; they now take `--episode <id>` (default s01e01) and ask here.
//
//   import { dirs, episodeArg, episodeConfig, episodeCuts } from '../episode-paths.js';
//   const { ep, argv } = episodeArg(process.argv.slice(2));   // takes --episode <id> out of argv
//   const D = dirs(ep);                                        // D.final, D.specs, D.cut, D.shotlist ...
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');   // dragons-kingdom/
export const DEFAULT_EPISODE = 's01e01';
const ID = /^[a-z0-9][a-z0-9_-]{0,31}$/i;

/** Every per-episode path, absolute. `work(preset)` is where render-shots keeps its dailies. */
export function dirs(ep = DEFAULT_EPISODE) {
  if (!ID.test(ep)) throw new Error(`episode id "${ep}": letters, digits, - and _ only (e.g. s01e02)`);
  const episode = path.join(ROOT, 'episodes', ep);
  const final = path.join(episode, 'final');
  const scenes = path.join(final, 'scenes');
  const cut = path.join(final, 'cut');
  const vo = path.join(final, 'vo');
  return {
    ep, id: ep, tag: ep.toUpperCase(), root: ROOT, episode,
    input: path.join(episode, 'input'),
    episodeJson: path.join(episode, 'episode.json'),
    engine: path.join(episode, 'engine'),
    final, scenes, specs: path.join(scenes, 'specs'), cut, vo,
    sound: path.join(final, 'sound'),
    audio: path.join(final, 'audio'),
    previs: path.join(final, 'previs'),
    tools: path.join(final, 'tools'),
    shotlist: path.join(final, 'shotlist.json'),
    dialogue: path.join(final, 'dialogue.json'),
    onscreen: path.join(final, 'onscreen-text.json'),
    renderJobs: path.join(final, 'render-jobs.json'),
    takes: path.join(vo, 'takes.json'),
    words: path.join(vo, 'words.json'),
    timings: path.join(cut, 'timings.json'),
    edl: (name = 'edl') => path.join(cut, `${name.replace(/\.json$/, '')}.json`),
    // Episode 1 keeps the dailies where 35 sessions of renders already are; later episodes get their own
    work: (preset = 'draft') => (ep === DEFAULT_EPISODE ? path.join(ROOT, 'output/director', preset) : path.join(ROOT, 'output/director', ep, preset)),
    stillsOut: ep === DEFAULT_EPISODE ? path.join(ROOT, 'output/director-stills') : path.join(ROOT, 'output/director-stills', ep),
  };
}

/** Takes `--episode <id>` (or `--episode=<id>`) out of an argv list: { ep, argv } (argv without it). */
export function episodeArg(argv, def = DEFAULT_EPISODE) {
  const rest = [];
  let ep = def;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--episode') { ep = argv[++i]; if (!ep || ep.startsWith('--')) throw new Error('--episode needs an id (e.g. s01e02)'); }
    else if (a.startsWith('--episode=')) ep = a.slice(10);
    else rest.push(a);
  }
  dirs(ep);                                                          // validates the id
  return { ep, argv: rest };
}

/** episodes/<ep>/episode.json, or null when the episode has none (Episode 1 has none). */
export function episodeConfig(ep = DEFAULT_EPISODE) {
  const f = dirs(ep).episodeJson;
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : null;
}

/** The draft cuts [{name, scenes, always}] from episode.json `cuts`, else `fallback`. The first cut is
 *  always written (it is THE cut, edl.json); the others once a shot of theirs is authored. */
export function episodeCuts(ep = DEFAULT_EPISODE, fallback = null) {
  const cfg = episodeConfig(ep);
  if (!cfg?.cuts?.length) return fallback;
  return cfg.cuts.map((c, i) => ({ name: c.name || (i ? `edl-${c.scenes.join('-')}` : 'edl'), scenes: c.scenes, ...(c.always ?? i === 0 ? { always: true } : {}) }));
}
