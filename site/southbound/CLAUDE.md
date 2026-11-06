# Southbound: working notes for Claude (read this first)

Southbound is an original Three.js open-world game (the owner calls it "my own version of Red Dead
Redemption 2", set on a fictional Gulf Coast: Calvera, Port Calvera, Mill Creek, Bayou Verde).
Live: https://untitled-new-game-project.vercel.app/southbound/ (Vercel team
`team_L5U81taqQnQczSAJlTv3ViZ6`, project `prj_rDZZmvExoE5yGiM8K8gpg8gxy1Wj`; check with
`mcp__Vercel__list_deployments` / `get_deployment`).

**The context window gets summarised often. Everything that must survive lives in this file,
`FEATURES.md` (the feature tracker and backlog) and `ROADMAP.md` (what shipped). Update
`FEATURES.md` every time a batch ships.**

## Standing rules (from the owner)

- Original work only: no recreating existing games, characters, names, art, music or IP. Only
  CC0 / CC-BY / MIT assets, credited in `CREDITS.md`.
- Strictly a real-world simulator: no sci-fi, no magic.
- Branch: `claude/ultimate-ai-legend-KhpoT`. Before pushing:
  `git fetch -q origin claude/ultimate-ai-legend-KhpoT && git merge -q --no-edit origin/claude/ultimate-ai-legend-KhpoT`
  (another session works on `dragons-kingdom/` in the same branch: never touch its files).
- Commit trailers (no model IDs anywhere in commits):
  `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01GGo1eNDjCCgCwGjdEgJhFf`
- No pull requests unless asked. Kill only our own processes, by PID. No foreground `sleep`
  (use Monitor until-loops / background tasks).
- The stop hook wants a clean tree at the end of a turn: commit verified work, or
  `git stash push -u -q -m "WIP: ..."` untested work (pop it on resume). Only stash once every
  running test page has loaded `game.js` (~30 s after starting it), or it loads the old bundle.

## The owner's standing direction

Alternate graphics milestones (G#) with feature batches (F#), shipping a version often.
The big ask: **add ~30 new things to every feature in the game, and 30+ brand-new features.**
Track it in `FEATURES.md` (per-feature counts, what's done, what's next). Pick the feature with
the fewest additions next. Be honest in reports about what is and isn't done.

## Layout

- `src/main.js`: boot, the game object, the frame/tick loop, vehicles, the test API (`window.SB`).
- `src/systems/*.js`: gameplay systems, installed in `src/systems/index.js` (order matters:
  earlier systems get first claim on the F key prompt). Each returns `{ update(dt, a, free) }`
  that may return a prompt string. Systems built before `game.mart`/`game.needs` exist must hook
  in lazily (see `foodplus.js`).
- `src/entities/`: people, police, vehicles, combat, clothing, body shading.
- `src/world/`: terrain, water, wakes, tracks, beams, grass (`grasscards.js` = real blade tufts),
  vegetation, sky, weather, roads, buildings.
- `ROADMAP.md`: newest phases at the top (Phase 1.41 is the latest at the time of writing).
- Build: `node tools/southbound/build.mjs` (from the repo root) bundles to `site/southbound/game.js`
  (commit the bundle). Two N8AO "duplicate key" warnings are normal.

## Testing

- Full QA: `node tools/southbound/qa.mjs low` (from the repo root): ~3-6 min, must be
  `684 passed, 0 failed ... no console errors` (the count grows as tests are added).
- Feature/screenshot tests: Playwright + SwiftShader scripts in the session scratchpad
  (copy the header of an existing one). Use `SB.freeze(true); SB.skipRender(true)`, step with
  `SB.step(n, 1/30)`, render only for the shot (`SB.skipRender(false); SB.renderNow()`), then
  `skipRender(true)` again. More than two browsers at once makes frames come out black/slow.
- `S.stepping` is true inside `SB.step`; systems that skip work while `S.frozen` must allow
  stepping (`if (S.frozen && !S.stepping) return`).
- Gotchas found the hard way: a material cloned from a shaded one carries its
  `onBeforeCompile` hook and gets shaded twice (guard declarations); vehicles you get into leave
  the `parked` list (LOD must include `S.vehicle`); `police.clear()` must not null startup
  handlers; never add a `//` comment in the middle of a one-line object or call (it swallows the
  rest of the line: use `/* */`); check the build output says "Done" before starting a test.
- Commit one batch at a time: if the next batch's edits are already in the tree, commit only the
  finished batch's files (and an `index.js` without the next batch's `add(...)` line), with the
  `game.js` that was built and QA'd for it.
