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
  vegetation, sky, weather, roads, buildings, yards (front yards: planned before the trees, built
  after them), palms (cabbage palms + saw palmettos), contact (contact shadows at building feet),
  streetclutter (signs, drains, litter, weeds), shoulders (road shoulders, building footings).
- `src/core/detail.js`: distance detail (far cars' small parts/insides/shadows, people's shadows, far
  camps) via camera layer 0; `setPressure` shrinks it when CPU-bound. `src/core/net.js`: connection
  tier (slow/medium/fast, `?net=` forces) and background downloads. Profile scripts that found the
  costs: `tools/southbound/perf-cpu.mjs` (per-system ms) and `perf-draws.mjs` (draw calls by pass and kind).
- Cars: every catalogue model's design is in `src/assets/catalog.js` DESIGNS (fractions of half the
  length for cabin positions, absolute heights, shape features drawn by `carbuilder.js` bodySDF).
  Cars are built a slice at a time (`buildCarGen`, `vehicle.js` warmCars) and traffic only spawns built
  ones. Render all of them with the contact-sheet approach (import catalog.js + carbuilder.js in a page).
- Guns: `src/entities/gunkit.js` builds every catalogue gun except the photo-scanned first few
  (`arsenal.js` REAL_FIRST); same hold description as downloaded models (g/f/w/b/t fractions).
  The support-hand point sits ~1.5 cm under the handguard (buildOpenGun lowers it 4.5 cm).
- **Watching the owner play** (`src/core/watch.js` in the game, `api/sb-watch.js` on the server,
  `tools/southbound/watch.mjs` to read): when the owner turns on Settings > Display > "Let Claude watch
  me play", errors arrive at once and a report with a screenshot every ~3 min of play. Read them:
  get the key with the Vercel MCP `web_fetch_vercel_url` on
  `https://<latest deployment url>/api/sb-watch?reveal=1` (only protected deployment addresses reveal it),
  `node tools/southbound/watch.mjs key <key>`, then `... new` (since the last check; pictures saved to
  `$SBWATCH_OUT`, look at them), `... list 20 error`, `... show <pathname>`, `... say "<note>"` (shows in
  the game). With no Blob store connected (`watch.mjs status` says store:false) the reports only reach the
  function log for ~1 hour: MCP `get_runtime_logs` with query `SBWATCH`. The cloud environment allows
  `untitled-new-game-project.vercel.app`, so the live site can be fetched/tested from here directly.
  Comment to the owner on what they were doing now and then, and fix what looks wrong. An hourly
  scheduled task (`trig_01XFqbdkJQU8S8NtwN8Zbobt`, "Southbound: watch the owner play", fires into this
  session at :54) does the check; delete it if the owner asks to stop.
- **The live feed** (watch along while the owner plays): with watching on, the game posts an update
  every 2 s and a 480 px picture every 5 s to `api/sb-live.js` (kept in the warm function's memory: all
  requests land on one instance, tested 20/20). Run `node tools/southbound/live.mjs auto` under Monitor
  (timeout 30 min, re-arm on expiry): it waits in the lobby until the owner starts playing, then prints
  a line per thing worth a look (💬 OWNER messages, errors, deaths, police, cars, places, below/above
  the ground, on its roof, crashes, jumps, fps drops, a NOW summary every 90 s); the newest picture is
  `$SBLIVE_OUT/latest.jpg` (default /tmp/sblive; look at it with Read). Answer the owner in the game:
  `node tools/southbound/live.mjs say <feedId> "..."` (the feed id is in the PLAYING line). The lobby
  needs `~/.sblive-secret`, whose sha256 is LOBBY_HASH in api/sb-live.js; a new container has no
  secret: make one (`head -c 24 /dev/urandom | od -An -tx1 | tr -d ' \n' > ~/.sblive-secret`), put its
  sha256 in LOBBY_HASH and deploy. Tests: `node tools/southbound/live-test.mjs` (all local).
- Sketchfab: the "Untitled-new-game-project" cloud environment allows it, but the saved API token was
  rejected; while a bad token is saved even search fails (the proxy adds it to every request). Never
  use the sketchfab.com/i/ website endpoints (blocked by the safety check).
- Performance rules learned: count draw calls, not triangles (WebGL pays CPU per call); never walk
  the whole scene (28k objects) in one frame, spread it over frames; three r170's
  `matrixWorldAutoUpdate=false` does not skip children (no gain from freezing hidden roots).
- `ROADMAP.md`: newest phases at the top (Phase 1.41 is the latest at the time of writing).
- Build: `node tools/southbound/build.mjs` (from the repo root) bundles to `site/southbound/game.js`
  (commit the bundle). Two N8AO "duplicate key" warnings are normal.

## Testing

- Full QA: `node tools/southbound/qa.mjs low` (from the repo root): ~3-6 min, must be
  `705 passed, 0 failed ... no console errors` (the count grows as tests are added).
- `node tools/southbound/watch-test.mjs`: the watcher on its own (picture of a WebGL frame, play and error
  reports, Claude's note), ~10 s. In the full QA, never read a frame back (toDataURL/createImageBitmap
  of the game canvas): it waits minutes for the test browser's software graphics.
- Feature/screenshot tests: Playwright + SwiftShader scripts in the session scratchpad
  (copy the header of an existing one). Use `SB.freeze(true); SB.skipRender(true)`, step with
  `SB.step(n, 1/30)`, render only for the shot (`SB.skipRender(false); SB.renderNow()`), then
  `skipRender(true)` again. More than two browsers at once makes frames come out black/slow.
- `S.stepping` is true inside `SB.step`; systems that skip work while `S.frozen` must allow
  stepping (`if (S.frozen && !S.stepping) return`).
- Gotchas found the hard way: a material cloned from a shaded one carries its
  `onBeforeCompile` hook and gets shaded twice (guard declarations), and `MeshStandardMaterial.clone()`
  resets `defines` to `{STANDARD}` (copy them back, or hair/skin shading loses `SB_HAIR` etc.); vehicles you get into leave
  the `parked` list (LOD must include `S.vehicle`); `police.clear()` must not null startup
  handlers; never add a `//` comment in the middle of a one-line object or call (it swallows the
  rest of the line: use `/* */`); check the build output says "Done" before starting a test;
  people removed from the scene must call `h.dispose()` (gone for good) or `h.freeGpu()` (may come
  back), or their skeleton's bone texture stays on the GPU (a long session piled up hundreds).
  A system that hands a person back to ordinary street life (`p.role = undefined`) must leave them
  somewhere to walk: `peds.home(p)` (people it created itself have no block/corner; that crashed the
  game for the owner). `peds.update` isolates each person's AI with try/catch (logs `[peds] ...`).
  Anything that walks up to the player, robs them or reacts to them asks `game.situation()`
  (systems/situation.js: pos is the car when driving; `reachable`, `muggable`, speed, indoors, scene,
  armed, wanted), never S.mode/player.pos alone (the on-foot body stays where you got in the car).
  Blood and wounds (G13): `systems/gore.js` wraps `peds.damage` (a wound is added BEFORE the hit:
  a killing hit starts the ragdoll) and `game.onPlayerHurt`; wounds live in the person's own material
  copies (`entities/woundfx.js`, uniforms in the bind pose; outfit materials keep the bind-pose point
  as `vOfP`, so hooks there must not expect `#include <begin_vertex>`); ground/wall blood is
  `world/blood.js` (`game.blood.spatter/pool/drop/smear`). Test: `gore-shots.mjs`-style close-ups.
  Bystanders take cover with `peds.panic(pos, r, { cover: true })` (mode 'cover', police findCover).
  Jobs have employers (F15, `systems/workplaces.js`, `game.work`): a job board's F opens a talk with the
  manager (a dialog that pauses the game), so tests start shifts with `G.jobs.start(id)` /
  `G.work.begin(id)`; `jobs.start(id, opts)` and `finish` report back through `game.work.shiftEnded`.
  A system can take over a building with `estate.claim(i, { kind, name, size, open(), furnish(ctx),
  enter(ctx), leave() })` (the barbershops, the courier depot, the offices); `estate.onEnter(fn)` adds
  points to any interior. Records live in `P.employ` (schedule, warnings, rank), `P.kit`, `P.ownBiz`.
  Destruction (F16, `systems/destruction.js`, `game.destruction`): big buildings (not houses/small shops,
  which are demolition.js) have structure `b.shp`; `damage(bi, n, at)`, `collapse(bi)`, rebuild sites in
  `P.wrecks` (`advance(bi, hours)` for tests). It chains `combat.onExplosion` and must be installed after
  props.js (which replaces the hook without chaining). It uses `game.demolition.show/worker/walkTo/face`
  and `game.explodeAt` (main.js). A collapsed building's collision box is lowered to the rubble (`b.col`).
  Ammo is by caliber (A1): `combat.rounds[caliber]` is the spare pool (saved as `P.weapons.rounds`);
  `combat.ammo[id]` is a Proxy whose entries keep `clip` and whose `reserve` is an accessor onto the
  caliber's pool, capped by `ammoCap(cal)` (arsenal.js `CALIBERS`: 500, rockets/grenades 50, arrows 20),
  so `a.reserve += n` anywhere is clamped. `peds.damage(p, n, from, { blast })`: blast must be a
  Vector3 (where it came from), not `true` (that gave NaN ragdolls). Never reference `transformed` in a
  global ShaderChunk (sprites have none): atmosphere.js builds fog's world position from mvPosition.
  Building doors: `estate.doorWalk(d, 'in'|'reach'|'out', done)` drives the player through `S.doorWalk`.
  Roads (1.66): `collision.surface` takes the NEAREST road piece (t:3 ribbon / t:2 deck), never the highest
  (that made every slope a staircase); `hm.capRoadBanks` keeps the coarse terrain mesh under the asphalt.
  Cars ride on springs: `v.sy` is the body's offset over the contact (`v.pos.y`), the wheels are moved back
  down by it, and anything that should follow the body (camera focus) adds `v.sy`. Probe scripts:
  scratchpad `hwy-probe.mjs` (jolts on a highway drive), `surf-class.mjs` (what the wheels ride on).
  HUD: `hud.big` is the full map canvas, `hud.bigMsg` the banner (they once shared a name: M broke).
  Acted-out scenes (A2, `systems/acts.js`, `game.acts`): `play(beats, {done})` runs in the `S.doorWalk`
  slot (main.js runs it instead of your controls; a teleport ends it). Beats: `{walk,face,clip,pose,t,
  start,end,each(dt,k,ctx),ik(F,k,ctx,P)}`. People: `person(at, heading, id)` (made for the scene),
  `fromPed(p)` (a street ped: arms in h.post, `release()` after), `fromHuman(h)` (a shopkeeper). Ready-made
  beats: handBeats/payBeats/eatBeats/treatBeats/pickupBeats/waveBeats/knifeBeats/workBeats, `doorstep(spot,
  item, opts)`, `prop(kind)`. Shop counters: acts watches `S.frozen` (a defineProperty): when a store screen
  or dialog closes with less money, the nearest `game.storeKeepers` clerk does the hand-over
  (`acts.nextGoods` = what comes over the counter). In a car, `S.carReach(gunPose, v)` poses your hands
  after the wheel. Arrests: law.js PHASES (cuff/hood/ground), `law._cut()` for tests. Job stops: jobs.js
  DOOR (doorstep jobs) and WORK (trades); their map markers have `noUse` so F reaches the job.
  Part 2/3 helpers: `acts.toward(who)` (walk to arm's length), `acts.fade(on, title, line)` and `game.fade(fn)`
  (black for a cut), `sleepBeats`/`pourBeats`, `game.counterPeople` ({h, payOnly}: street cart vendors, the
  hideout crew) beside `game.storeKeepers`, `acts.phoneUp/phoneAway` (wrapped round the phone's show/close),
  `game.walkIntoVehicle(v)` (job vans), `jobs.atDoor()`, `game.civic[id].staff` (the desk sergeant, the nurse).
  While a delivery is on, that house's own door point hides (`d !== game.deliveryDoor`) or F walks you in.
  Nothing renders while `S.frozen` (main.js frame()): a pose struck behind a paused menu is never seen.
  `acts.play` returns null WITHOUT calling done when it can't start (in a scene, walking to a car, in a
  car, dead): every caller does `if (play(...)) return; <instant version>`. `game.cancelEnter()` stops a
  walk to a car (teleports and quitting a shift call it). Wrapping a game function (crew.js wraps
  game.sleep): pass every argument through.
  Never run python edits through a bash heredoc that mentions `.remove(`: the safety check can't parse it;
  write the script to a file first.
  The mouse is captured (pointer lock) only while no `.screen` menu is showing (`core/input.js`): with
  it captured, clicks go to the game, and the owner couldn't click a setting on their PC. Headless
  Playwright: a lock taken just before Esc stays on unless that guard is there; use `{ force: true }`
  clicks in-game (the SwiftShader frames keep elements from ever counting as "stable").
- Commit one batch at a time: if the next batch's edits are already in the tree, commit only the
  finished batch's files (and an `index.js` without the next batch's `add(...)` line), with the
  `game.js` that was built and QA'd for it.
