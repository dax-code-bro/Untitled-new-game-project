# Dragon's Kingdom S01E01: native 4K render schedule for the locked shooting script

> **Plan only.** Nothing of the final script has been rendered. The seconds per frame are measured on the five style frames and estimated from them for the other sets; nobody has rendered a frame of the new sets yet. Every figure here is an estimate until the pilot (step 1 below) measures the real scenes. Made by `tools/shotlist/final_render_schedule.py` from `shotlist.json`; the per-shot job list is `render-jobs.json`.

## The answer

- **78,096 frames** at 24 fps for the expected 54:14 cut (726 shots; 76,944 frames are 3D, the rest are black or text cards made in the conform).
- **About 2,580 hours of rendering for one browser** at native 4K (range 1,956-3,545 h from the per-set seconds per frame; up to 4,490 h if the loose cut and the slow end both happen).
- **On this one machine (4 vCPU, no GPU), two browsers: about 2,366 hours of wall-clock time, about 99 days (3.2 months) of continuous rendering**, scene setup included. Two browsers do not halve the time here: SwiftShader already uses all four threads, and the README benchmark measured only a 1.10x gain for the second browser.
- **Why so much more than the old "43-70 hours":** that figure used the speed of the simple benchmark scene (0.37-0.50 frames per second). The real sets are much heavier. The five style frames, rendered at 4K on this machine, took 131-822 s per frame with the 8-sub-frame film finish, which is about 26-270 s per frame with velocity motion blur. Cling, the heaviest set, is about a third of the episode.
- **Disk:** the 10-bit intermediates of the whole episode would take about 21-42 GB, and a finished 4K master about 11-23 GB, against about 15 GB free here. So the episode is rendered, checked and delivered **one scene at a time** (largest scene: 4.7-9.3 GB of intermediates), and the full-episode join happens on a drive with room for both the scene files and the master.
- **What would make it faster without changing the look:** a second (or third) machine taking whole scenes (the job list splits cleanly by scene); a machine with a real graphics card (`--gpu`, never measured here); the free tricks in `../preview/render-plan.md` ("Cheapest tricks that keep the look": grass LOD, skipping the ocean where it cannot be seen, the shadow cache), each checked with an A/B still. `final-fast` and `--twos` are not allowed for masters (`SERIES.md` section 2); they are fine for the animatic and for previews, which must be labelled as previews.

## Seconds per 4K frame, by set

MEASURED anchors on this machine (`../style-frames/README.md`, `scenes/lib/sets/PROGRESS.md`, round 4, `--preset final`, 8-sub-frame film finish): F1 prologue 47.8 s (shared machine), F2 riding grounds 434.7 s, F3 flight 131.0 s, F4 birthing chamber 428.7 s, F5 Cling square 821.5 s per frame. Masters use velocity motion blur instead of 8 sub-frames (same lens, grade and grain): that was MEASURED at 0.20x on F2 (253 to 50.7 s) and 0.33x on F1 (39 to 12.7 s) (`../preview/render-plan.md`). So: F1 sets use the measured 12.7-16 s; F2 sets 0.20x (the ratio measured on F2); F3-F5 sets 0.25x, with 0.20x and 0.33x as the range. The pass (1E-03) keeps 8 sub-frames (MEASURED F3: 131 s). Shots with dust, destruction, fog or a crowd outside Cling get x1.10-1.25.

| Set | Shots | Frames | s per 4K frame | Hours (1 browser) | Basis |
|---|---:|---:|---:|---:|---|
| CLING_SQUARE | 222 | 23,652 | 205 | 1410.9 | ESTIMATE from MEASURED F5 821.5 s (8 sub-frames) x 0.20-0.33 |
| VERDOR_GROUNDS | 126 | 13,512 | 87 | 329.7 | ESTIMATE from MEASURED F2 434.7 s x 0.20 (the ratio measured on F2); low = older F2 velocity 50.7 s MEASURED |
| BIRTHING_CHAMBER | 64 | 6,984 | 107 | 207.6 | ESTIMATE from MEASURED F4 428.7 s (8 sub-frames) x 0.20-0.33 |
| TREATMENT_ROOM | 68 | 8,532 | 86 | 203.8 | ESTIMATE: 0.8 x F4 (interior, 3-4 hero people, coast through the opening) |
| CLING_SKY | 18 | 1,920 | 144 | 80.9 | ESTIMATE: 0.7 x F5 (Starlight hero over the village) |
| SKY_OFF_VERDOR | 73 | 7,380 | 33 | 68.9 | ESTIMATE from MEASURED F3 131.0 s x 0.20-0.33 |
| VERDOR_HARBOR | 16 | 1,524 | 154 | 65.2 | ESTIMATE: 0.75 x F5 (quay, Santa Maria, people, ocean) |
| VERDOR_AERIAL | 18 | 2,100 | 103 | 60.1 | ESTIMATE: 0.5 x F5 (a whole town and harbor at a distance) |
| COASTAL_SKY_WATER | 49 | 3,888 | 33 | 36.1 | ESTIMATE: F3-class (two creatures, riders, ocean) |
| SANTA_MARIA_DECK | 11 | 1,296 | 87 | 31.3 | ESTIMATE: F2-class (ship close, a few people, sea behind) |
| OUTER_ROCKS | 23 | 2,076 | 46 | 26.5 | ESTIMATE: 1.4 x F3 (sea stacks, birds, mist volumes) |
| CLING_ROAD | 4 | 408 | 205 | 20.0 | ESTIMATE: 0.8 x F5 (road, gate, carts, crowd, farmland) (x1.25 for dust/crowd/fog in this shot) |
| PALACE_CORRIDOR | 10 | 1,044 | 64 | 18.6 | ESTIMATE: 0.6 x F4 (architecture interior, 1-4 people) |
| ALEXANDRIA_ROOM | 4 | 384 | 64 | 6.8 | ESTIMATE: 0.6 x F4 (one person, window light, no hatchling or cloth drape) |
| RIDING_SCHOOL_FIELD | 2 | 240 | 87 | 5.8 | ESTIMATE: F2-class (grass, dragons, riders) |
| PROLOGUE_VISTAS | 9 | 1,188 | 15 | 5.0 | ESTIMATE: F1-class vistas (sea, haze, terrain at distance) |
| SEA_COAST_DAWN | 6 | 816 | 14 | 3.4 | MEASURED: F1 velocity 12.7 s (README "13 s (F1)"); round-4 F1 47.8 s x 0.33 = 15.8 s |
| CARD_BLACK | 3 | 1,152 | 0 | 0.0 | no 3D render |
| **Total** | 726 | 78,096 | | **2580** | |

(Per-shot multipliers mean a set's shots can differ from the figure in this table; `render-jobs.json` has each job's own figure.)

## Per scene, in delivery order

Each scene is a delivery: it is rendered, conformed with its sound, checked end to end and sent to Daxtyn before the next one starts, so finished scenes reach him one by one and a partial render is always a watchable beginning.

| # | Scene | Starts | Length | Shots / jobs | Frames | Mean s/frame | Render h (1 browser) | Range h | Wall h (2 browsers) | Days | Intermediates GB | Scene master GB |
|---:|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---|---|
| 1 | PROLOGUE+TITLE: Historical prologue and main title | 0:00 | 1:43 | 18 / 17 | 2,472 | 28 | 18 | 14-25 | 17 | 0.7 | 0.6-1.3 | 0.4-0.7 |
| 2 | 1A: The gold hatchling | 1:43 | 4:14 | 58 / 58 | 6,108 | 97 | 165 | 129-223 | 151 | 6.3 | 1.7-3.3 | 0.9-1.8 |
| 3 | 1B: Preparing to fly | 5:58 | 2:18 | 32 / 32 | 3,312 | 87 | 80 | 47-132 | 74 | 3.1 | 0.9-1.8 | 0.5-1.0 |
| 4 | 1C: Takeoff and open sky | 8:16 | 6:22 | 81 / 81 | 9,168 | 105 | 269 | 202-370 | 247 | 10.3 | 2.5-5.0 | 1.3-2.7 |
| 5 | 1D: Siblings, succession, and the playful nip | 14:38 | 1:59 | 26 / 26 | 2,856 | 33 | 26 | 21-34 | 25 | 1.0 | 0.8-1.6 | 0.4-0.8 |
| 6 | 1E: The first fast pass | 16:36 | 0:56 | 18 / 18 | 1,356 | 36 | 13 | 11-17 | 13 | 0.5 | 0.4-0.7 | 0.2-0.4 |
| 7 | 1F: Pursuit and the scout's fall | 17:33 | 4:04 | 70 / 70 | 5,856 | 46 | 75 | 56-103 | 70 | 2.9 | 1.6-3.2 | 0.9-1.7 |
| 8 | 2A: Return to Verdor | 21:37 | 2:21 | 34 / 34 | 3,384 | 81 | 76 | 46-123 | 70 | 2.9 | 0.9-1.9 | 0.5-1.0 |
| 9 | 2B: Treatment and Remi's report | 23:58 | 2:33 | 29 / 29 | 3,672 | 86 | 88 | 66-117 | 81 | 3.4 | 1.0-2.0 | 0.5-1.1 |
| 10 | 2C: Santa Maria orders and sibling aftermath | 26:31 | 11:49 | 153 / 153 | 17,016 | 104 | 491 | 349-704 | 450 | 18.8 | 4.7-9.3 | 2.5-5.0 |
| 11 | 3A: Cling's festival and its king | 38:20 | 6:24 | 78 / 78 | 9,228 | 205 | 525 | 420-695 | 480 | 20.0 | 2.5-5.0 | 1.4-2.7 |
| 12 | 3B: The white dragon approaches | 44:44 | 1:44 | 33 / 33 | 2,496 | 184 | 128 | 99-171 | 117 | 4.9 | 0.7-1.4 | 0.4-0.7 |
| 13 | 3C: Starlight's attack | 46:28 | 3:23 | 50 / 50 | 4,872 | 228 | 308 | 244-409 | 281 | 11.7 | 1.3-2.7 | 0.7-1.4 |
| 14 | 3D: Aftermath and cliffhanger | 49:52 | 3:42 | 45 / 44 | 5,340 | 218 | 318 | 252-422 | 290 | 12.1 | 1.4-2.9 | 0.8-1.6 |
| 15 | END: End credits | 53:34 | 0:40 | 1 / 0 | 960 | 0 | 0 | 0-0 | 0 | 0.0 | 0.0-0.0 | 0.1-0.3 |
| | **Total** | | **54:14** | **726 / 723** | **78,096** | | **2580** | 1956-3545 | **2366** | **99** | 21-42 | 11-23 |

Wall hours = render hours / 1.10 (two browsers) + one scene setup per job (MEASURED on the style frames: 20 s on the sea, 96-106 s on the heavy sets). Disk: intermediates 0.28-0.56 MB per frame (10-bit CRF 12 with film grain, ESTIMATE from the preview plan); masters 0.15-0.30 MB per frame (CRF 16, about 29-58 Mbit/s, ESTIMATE). The pilot measures both.

## Build and render order

1. **Pilot (about 2-3 days).** Before any scene: render 24 frames of one typical shot from every set that exists or is built next (the five style-frame sets first), with `--timing` on one frame each, at native 4K. Record the steady-state seconds per frame and the peak memory, put them into `final_build.py` (`SPF`), and rebuild this schedule. Check that two browsers fit in memory on the heavy sets (each 4K browser needs about 2.6 GB on the benchmark; Cling needs more); if not, use `--workers 1` and lose about 9 %% of the throughput.
2. **Build what the next delivery needs, then render it.** The ids are the items in `assets-delta.md`. Build work and rendering overlap: while one scene renders (CPU-bound, both browsers), the next scene's sets and animation are written and checked at draft and preview size, which costs little CPU.
3. **Deliver in story order:**

   1. **PROLOGUE+TITLE: Historical prologue and main title** (1:43, 2,472 frames, about 0.7 days on this machine). Sets: PROLOGUE_VISTAS (1,188 frames), SEA_COAST_DAWN (816 frames), BIRTHING_CHAMBER (192 frames), VERDOR_GROUNDS (180 frames), CARD_BLACK (96 frames). Build first: Nothing new: F1 style frame, the prologue vistas of the preview plan, the title egg.
   2. **1A: The gold hatchling** (4:14, 6,108 frames, about 6.3 days on this machine). Sets: BIRTHING_CHAMBER (4,404 frames), PALACE_CORRIDOR (768 frames), VERDOR_GROUNDS (552 frames), ALEXANDRIA_ROOM (384 frames). Build first: S1 queen's room, S2 palace corridor; H1 young attendant, H2 two servants; P1 wine jug and cup; D4 Leaf's low crouch (X2); A1 walking and everyday actions.
   3. **1B: Preparing to fly** (2:18, 3,312 frames, about 3.1 days on this machine). Sets: VERDOR_GROUNDS (3,312 frames). Build first: S8 riding-grounds additions (stakes, rig runners); P2 clay pipe and ember, F4 pipe smoke; D4 Leaf low and level, D6 Charcoal lowering for mounting; A2 climbing the access rig.
   4. **1C: Takeoff and open sky** (6:22, 9,168 frames, about 10.3 days on this machine). Sets: CLING_SQUARE (2,412 frames), SKY_OFF_VERDOR (2,340 frames), VERDOR_AERIAL (1,872 frames), OUTER_ROCKS (1,392 frames), VERDOR_GROUNDS (672 frames), VERDOR_HARBOR (480 frames). Build first: S3 Verdor from the air, S4 outer rocks, S9a Cling morning state; D1 small working dragons, D2 young riders' dragons; H3 lookout, H7 instructor, H8 young riders; P8 nets, slipway, fishing boats; F4 sweet pipe smoke; D7 seabird flocks, F8 downwash and spray at the rocks; D6 Charcoal's climb and dive; A3 quay and lesson behaviours.
   5. **1D: Siblings, succession, and the playful nip** (1:59, 2,856 frames, about 1.0 days on this machine). Sets: SKY_OFF_VERDOR (2,856 frames). Build first: Nothing new (head-in-mouth exists).
   6. **1E: The first fast pass** (0:56, 1,356 frames, about 0.5 days on this machine). Sets: SKY_OFF_VERDOR (1,356 frames). Build first: Nothing new (the pass renders with 8 sub-frames, 1E-03).
   7. **1F: Pursuit and the scout's fall** (4:04, 5,856 frames, about 2.9 days on this machine). Sets: COASTAL_SKY_WATER (3,888 frames), SANTA_MARIA_DECK (720 frames), OUTER_ROCKS (684 frames), SKY_OFF_VERDOR (240 frames), VERDOR_AERIAL (228 frames), VERDOR_HARBOR (96 frames). Build first: F1 blood (spray, decals, red stain in the sea), F2 burn on the rider, F3 the torn wing root with blood, F7 mist white-out, F8 downwash at the rocks, F10 sun glare; S5 Santa Maria deck; H4 ship's master, H5 crew (seated, dice); P3 ale jug, dice and cup.
   8. **2A: Return to Verdor** (2:21, 3,384 frames, about 2.9 days on this machine). Sets: VERDOR_GROUNDS (2,712 frames), SKY_OFF_VERDOR (588 frames), VERDOR_HARBOR (84 frames). Build first: F1 blood on Remi (state 1 to 2), D5 Charcoal's bloody jaw; H6 second keeper.
   9. **2B: Treatment and Remi's report** (2:33, 3,672 frames, about 3.4 days on this machine). Sets: TREATMENT_ROOM (3,672 frames). Build first: F1 Remi blood state 2 (hands, sleeves, hairline).
   10. **2C: Santa Maria orders and sibling aftermath** (11:49, 17,016 frames, about 18.8 days on this machine). Sets: VERDOR_GROUNDS (6,084 frames), TREATMENT_ROOM (4,860 frames), BIRTHING_CHAMBER (2,388 frames), CLING_SQUARE (1,320 frames), VERDOR_HARBOR (864 frames), SANTA_MARIA_DECK (576 frames), CLING_ROAD (408 frames), PALACE_CORRIDOR (276 frames), RIDING_SCHOOL_FIELD (240 frames). Build first: S6 riding-school field, S7 road outside Cling, S9b Cling midday state; H9 farm family (villager uninjured, partner, two small children), H10 old woman; D3 hatchling drinking and standing; D5 and D6 Charcoal's jaw washed, the saddle off, eating; P4 feed cart, P5 buckets and wet cloths, P6 spades and turf, P7 ship's boat, poles, sail set; F1 pink water, red runoff, membrane strip; F9 sail filling, gull swoop; A4 children's dance lesson.
   11. **3A: Cling's festival and its king** (6:24, 9,228 frames, about 20.0 days on this machine). Sets: CLING_SQUARE (9,228 frames). Build first: P9 festival table, honey cakes, cups and jugs, upturned crate, the king's plain seat; A4 children's dance, A5 table and singing behaviours, toast.
   12. **3B: The white dragon approaches** (1:44, 2,496 frames, about 4.9 days on this machine). Sets: CLING_SQUARE (1,656 frames), CLING_SKY (840 frames). Build first: Nothing new beyond 3A (Starlight from F5; X24 high view).
   13. **3C: Starlight's attack** (3:23, 4,872 frames, about 11.7 days on this machine). Sets: CLING_SQUARE (4,320 frames), CLING_SKY (552 frames). Build first: F6 roofline collapse and breaking music stage, F1 blood on paving and a wall smear, F3 the villager's split scalp and open fracture; H11 escort guard (no lines, distinct), H12 the dead (adult bodies, lying and covered); A6 evacuation on two routes, falls, stunt (R16b).
   14. **3D: Aftermath and cliffhanger** (3:42, 5,340 frames, about 12.1 days on this machine). Sets: CLING_SQUARE (4,716 frames), CLING_SKY (528 frames), CARD_BLACK (96 frames). Build first: S9c Cling after the attack (dust, wreckage, the dead laid out below the steps); H12 covered dead, P10 broken instrument, P11 banner-pole splint; A7 survivors, carrying the injured, searching.
   15. **END: End credits** (0:40, 960 frames, about 0.0 days on this machine). Sets: CARD_BLACK (960 frames). Build first: Text only (credits from the real contributors and licences).

4. **If a second machine is available**, give it whole scenes from the far end of the list (3A-3D, the heaviest: Cling) while this machine works from the start. The Cling square must be finished by delivery 4 anyway, because 1C (X5) and 2C (X14) visit it.

## Job and chunk layout (a restart loses little)

- **One `render.mjs` job per shot** (723 jobs; black and text cards are not rendered, they are made in the conform). Each job has its own folder, `output/s01e01/<scene>/<shot>/` (git-ignored). A finished shot stays valid when another shot is fixed later, and `render.mjs` refuses to mix versions inside one video.
- **Scene files** go in `episodes/s01e01/final/scenes/<set>.js` (to be written; the commands in `render-jobs.json` name them). Each set scene reads a generated shot table (camera, lens, blocking per shot) in `setup()` so jobs fingerprint it, and `update(t)` poses everything as a pure function of `t`, as in the preview plan.
- **Chunks:** 2 s (48 frames) where a frame takes under ~31 s, 1 s up to ~62 s, 0.5 s up to 125 s, and 0.25 s (6 frames) above that, so one chunk is at most about 25 minutes of one browser's work (the slowest, a dusty Cling shot, about 26 minutes). `render.mjs` decodes and checksums every chunk before marking it done.
- **After a restart or a crash, run the same command again.** Finished jobs are skipped, and an interrupted job re-renders only the chunks that were not finished and verified: at most one chunk per browser is lost.
- **Masters:** `--preset final --cinematic velocity --bit-depth 10 --crf 12 --workers 2` for every shot; 1E-03 keeps the 8-sub-frame film finish (`--cinematic film`). No `final-fast`, no `--twos` (`SERIES.md` section 2).

## Disk plan (about 15 GB free on this machine)

- **While a scene renders:** its shot files (largest scene 4.7-9.3 GB) plus the chunk folders of the shots in progress. Delete each shot's chunk folder as soon as its `.mp4` is verified (`SERIES.md` section 2).
- **Conform the scene:** trim, cut and dissolve the shots, draw the captions, mux the scene's stereo mix and subtitles, write one scene master (10-bit, CRF 16), and check it from start to end (sound present, no black or repeated footage, faces and dragons consistent, continuity flags). Then copy the scene master off the machine and delete the scene's shot files.
- **The full episode** is joined from the scene masters with a stream copy (no re-encode). The joined master is about 11-23 GB, so the join needs a drive with room for the scene masters and the master at once, about 23-46 GB: not this machine. An 8-bit copy for playback anywhere and a 10-bit copy for YouTube are made from it there.
- **Never commit** video, audio masters or chunk folders to git (`output/` is git-ignored).

## Risks

- **The estimates are not measured on the new sets.** Seven sets do not exist yet (see `assets-delta.md`), and the Cling estimate alone moves the total by hundreds of hours. The pilot settles it.
- **Months, not days.** On this one machine the episode is a 99-day render even if nothing goes wrong. Retakes (a fix found while checking a scene) add to it: plan about 1.3-1.5x the final pass for fixes on the hard shots (167 hard shots).
- **Building comes first.** The bottleneck before any of this is building the 395 new shots' sets, people, dragons, effects and animation (`assets-delta.md`), not render hours.
- **The machine is shared.** Other workflows run heavy jobs here; these figures assume the CPU is free.
