# Sound track: progress (for the next session)

## State (2026-11-03, session 7: X4 harbour spots + 1C wingbeat that reads as a wing)

- **Leaf's `wingbeat_light` rebuilt** (`fx/synth.mjs`). The s6 version (0.62 s whoosh) was measured with
  `scratchpad/eng1/sound/s7/measure.mjs`: rise 10-90 % 185 ms, 350 ms above -12 dB, 61 % of its spectral density at
  250-500 Hz (the same band as `flight_wind`), no flutter -> a gust, not a wing. New "fwup": faint pre-swell, a 45 ms
  push (110-1300 Hz) that still PEAKS at dur*up (0.31 s, so every row's `at` / sync is unchanged), 70 ms decay, a
  20-27 Hz membrane flutter on 1-4.2 kHz noise and a small thump: rise 40-55 ms, 120-140 ms above -12 dB, ~15 % at
  1-4 kHz. Shorter stroke = ~4 dB less energy at the same peak, so all 14 `wingbeat_light` rows got +3 dB.
  In the 1C mix (`scratchpad/eng1/sound/s7/beatsnr.py`, 50 ms windows at the predicted peaks): 1C-17 beats sit +7 dB
  over the wind bed at 1-4 kHz (was +4 before the +3 dB), 1C-11 mix beat-vs-gap +12.5 dB at 1-4 kHz. Seen:
  `s7/1C-17-fx-amb-mix.png` (fx / ambience / mix spectrograms of 1C-17: three short broadband strokes at 0.37 / 1.63 /
  2.87 s = the predicted 0.36 / 1.61 / 2.86, clearly separate from the steady wind, visible in the mix).
- **X4 harbour spots** (33 rows in `fx/spots.json`, X4-01..X4-13, placed by shot offsets on the slates; they move with
  the shots when the director renders them). New recipes (all synthesised): `gull` (2:1 FM yelp series, formants
  2.1/3.3 kHz), `boat_bell` (bronze partials 0.5/1/1.19/1.5/2/2.66/3.18/4.1 with beating), `fish_slap`, `rope_strain`,
  `net_drip` (rising-chirp droplets), `dragon_call` (`size` 1 = Leaf's bright "kree-ip", 1.6 = the quay dragon's
  lower rough answer), `walla` (wordless babble: glottal sawtooth through per-syllable vowel formants, phrases +
  pauses, `pause` dip for X4-07). New spaces: `harbour` (one 140 ms reflection) and `stone_wall` (82/150/260 ms
  reflections: Leaf ~14 m above the wall in X4-02) via a new `echoes` key in `fx.mjs` spaces; `space_of_set`
  VERDOR_AERIAL -> air, VERDOR_HARBOR -> harbour. Seen: `s7/x4-sheet-spec.png` (every new recipe's spectrogram),
  `s7/X4-mix.png` (mix 91.5-137.5 s), `s7/X4-07-zoom.png` (walla syllable blobs 300-1500 Hz, thinning in the 1.4-2.7 s
  pause, the heavy beat at 1.6 s).
- **harbour_quay** bed: the noise "murmur" layers (bp 480 / 1500 with a 3-6 Hz flutter: hiss-like, ~0.3 modulation
  depth) lowered 8 / 7 dB to a far wash; the talk is now `walla` spots per harbour shot.
- **1C re-mix**: `final/audio/cuts/1C/DragonsKingdom_S01E01_draft-cut_1C_sound.mp4` program -16.7 LUFS (whole cut
  -20.2), TP -1.6 dBTP (AAC -16.7 / -1.4), min dialogue margin 12.7 LU, PASS, sha256 5889acc21560a7e7. Dialogue
  unchanged -> ASR not re-run. NOT listened to by a person.

## Next steps (in order)

1. **Listen** to 1C 28-95 s on the PC: does the new Leaf stroke read as a wing? Knobs: the flutter gain (3.2) and
   the push decay (0.07 s) in `wingbeat_light`; row `gain_db`. Then the X4 slates 91.5-150 s (gulls, bell, walla).
2. When X4 shots get rendered: check the X4-08 call on picture (spec `call` act at 0.8 s; answer at 1.75 s), X4-02
   beats vs Leaf's wing (same 0.8 Hz model, `at` 0.05), X4-10 mast pass whoosh at 2.6 s, X4-07 heavy beat vs the
   shadow crossing. X4-03: spec has Charcoal GLIDING, shotlist says "deep slow beats overhead" - only an air rush is
   spotted (REQUEST director). If he flaps: add `wingbeat` at 0.16 every 1.6 s.
3. VO REQUESTS (not synth): the crew's wordless rhythm call (X4-05), the lookout's laugh (X4-10), the instructor's
   call + Abby's laugh (X4-13), recorded crew/market walla to replace the `walla` placeholder.
4. Score: M8 fades by X4-01 +3 s; X4-20 needs "the light theme" again when X4 exists.
5. Earlier items below still stand (flight_wind level for 1D/1E, M6 basses re-render check, Cling square bed +
   diegetic festival music, VSCO 2 CE via sfizz, per-line voice treatment, episode-timeline mix).

## State (2026-11-02, session 6: wingbeat sync on the rendered 1C flight + harbour bed)

- **Wingbeat sync** (director s15 request): 1C-07..19 are now rendered drafts (director work dir
  `scratchpad/eng1/director/work1B/shots/1C-*.mp4`). Phase model, read from `scenes/lib/creatures/poses.js` `flight()` +
  `wingFlap()` and CONFIRMED on frames (contact strips of 1C-17 every 5 frames and 1C-13 every 3 frames): pose clock =
  absolute shot time, cycle 0 = wings up, downstroke = first 57 % of the cycle, so the wing passes level on the
  downstroke at ~0.285 x period. Leaf (`flapHz` 0.8): 1.25 s period, level-on-downstroke at 0.36 / 1.61 / 2.86 s
  (seen at 0.42 / 1.67 / 2.92 in 1C-17); 1C-13 `hz: 1.25` -> 0.8 s, mid-downstroke 0.23 s; Charcoal (`hz` 0.625):
  1.6 s, mid-downstroke 0.46 s (seen ~0.5 s in 1C-13).
- `fx/spots.json` 1C-07..1C-18 flight-beat rows rewritten: Leaf `wingbeat_light` dur = period/2, up 0.5, `at` =
  0.285 x period - dur/2 (0.05 s; 0.03 in 1C-13), `every_s` = period, no jitter; Charcoal `wingbeat` at 0.16 every
  1.6 s (recipe peak ~0.3 s). Beat rows removed where Charcoal GLIDES in the spec (1C-14, 1C-18; also 1C-12/1C-17):
  1C-14 now has faint Leaf beats under the lines (duck 8), 1C-18 faint off-screen Leaf. New: 1C-15 both pairs far
  under the theme (-30 / -33). 1C-10 / 1C-12 / 1C-19 (extreme wides) stay air-only.
- `fx/synth.mjs` `wingbeat_light`: buffer now holds the whole decay (peak + 4 tau) and fades out over 80 ms (the
  longer dur showed a hard cut-off at -19 dB on the fx waveform). Only 1C rows use this recipe.
- **harbour_quay** bed (`beds.json`, VERDOR_HARBOR -> harbour_quay, target -24, duck 8): quay-wall slaps (brown,
  irregular 2.3 / 1.37 s), wet splashes 1.9 kHz, wood knocks (2 crackle layers, bp 380 / 620), breeze, and a
  PLACEHOLDER crowd murmur (bp 480 + 1500 noise with a 3-6 Hz flutter). Seen: spectrogram + waveform of the ambience
  stem 104-120 s (`scratchpad/eng1/sound/harbour-bed.png`): slaps every ~3-4 s, broadband to 60 Hz, a steady
  500-1100 Hz murmur band; 15 s at X4-04/05 measure -24.7 LUFS. X4 shots are still slates (not in the program
  region), so it only plays under slates for now. NOT listened to.
- **1C re-mix** `final/audio/cuts/1C/DragonsKingdom_S01E01_draft-cut_1C_sound.mp4`: program -16.7 LUFS (whole cut
  -20.1), TP -1.6 dBTP (AAC -16.7 / -1.4), min dialogue margin 12.6 LU, PASS, mix sha256 2c8b2dc893d6f7a2. Seen:
  `scratchpad/eng1/sound/1C-beatsync.png` (fx-stem waveform of 1C-11 / 1C-13 / 1C-17 with the predicted
  mid-downstroke marks: Leaf's whooshes peak on the green marks) and `1C-beat-frames.png` (cut frames AT the audio
  peaks: Leaf's wings level mid-stroke in all 8). ASR not re-run (dialogue unchanged; margins unchanged). 1C-16 is
  still the director's broken green frame. Not re-run for byte identity (no jitter left in these rows; seeds fixed).

## Next steps (in order)

1. **Listen** to 1C 28-95 s on the PC: beat levels (Leaf -21..-34, Charcoal -17..-30), whether the 1.25 s Leaf
   whoosh (now 0.62 s long) reads as a wingbeat or as wind; `wingbeat_light` dur/up per row are the knobs.
2. If the director changes any flight act (`hz`, `phase`, `tOffset`, `local: true`, or a flight act that starts
   later than 0 with `local`), recompute `at` with the formula above. A quick check: `ffmpeg -i <shot>.mp4 -vf
   "select='not(mod(n\,5))',scale=480:-1,tile=4x4"` and find the frames where the wing passes level going down.
3. X4 spots when X4 shots are specced/rendered: gulls (new synth recipe: two-formant FM yelp), boat bell (partials,
   already have `clink`/`partials` helpers), fish slaps (`wet_scrape`-like thump), rope strain (`rope_creak`), crew
   rhythm call (wordless: a VO/performance REQUEST, not synth), market walla (real walla wanted: REQUEST VO track for
   a few CC0/own recorded crowd lines; until then harbour_quay's murmur layer). Leaf's beats echo off stone in X4-02
   (space `stone_open` reverb), one heavy beat X4-07, Leaf's call + quay dragon answer X4-08 (new creature-call recipe).
4. `harbour_quay` by ear: the murmur band may read as wind/hiss -> lower layer 3 (-12) or narrow it; slaps may be
   too regular.
5. Earlier items below still stand (flight_wind level for 1D/1E, M6 basses re-render check, Cling square bed +
   diegetic festival music, VSCO 2 CE via sfizz, per-line voice treatment, episode-timeline mix).

## State (2026-11-02, session 5: 1C flight sound + program-region loudness)

- **Loudness logic** (`mix.mjs`): I/LRA are measured over the **program region** = shots with a picture spec (EDL
  `kind` != `missing`); slates of unspecced shots keep the same gain (beds only). Report: `result.I` (program),
  `result.I_full` (whole cut), `program.windows_s`, `muxed.aac_I` (program) / `aac_I_full`. Cuts with no missing shots
  (1A, 1B) are unaffected (not re-mixed). The +2 dB dialogue cap (words <= -15 LUFS) still applies.
- **1C flight** (1C-07..1C-19, still slates in the director's cut but specced, with L042-L045):
  - bed `flight_wind` (SKY_OFF_VERDOR; target -22, duck 7): steady air rush, slow gusts, faint high edge.
  - fx recipes `wingbeat_light` (Leaf: quick, smaller, membrane snap) and `air_rush` (gust past camera; `dark`,
    `whistle`); space `air` (almost dry). 21 spot rows 1C-07..1C-19 in `fx/spots.json` (Leaf ~2.3 beats/s, Charcoal
    ~0.6/s; 1C-11 two rhythms L/R; 1C-13 heavy beats approach while Leaf's quicken; beats ducked 8 dB in 1C-09/1C-14;
    leather creak 1C-16; snort 1C-17).
  - music: the **light theme** (`LIGHT` in `scores.mjs`: A | D . E F# - A | B A F# | D, the dawn head + Leaf's turn).
    **M7 sky glimpse** (`sky_glimpse`, beat 0 = 1C-10, -21.5 LUFS): pad + harp + the theme once on flute, left hanging
    on F#, gone by 1C-11 +2.5 s ("music stops; only wingbeats"). **M8 light theme** (`light_theme`, beat 0 = 1C-15,
    beat = cut time - 65.5, -19.5 LUFS): pad + harp + theme low on clarinet (1C-15), Leaf's figure (1C-17), dawn head
    on soft horn (1C-18), the theme whole on flute + violins resolving to D on 1C-19, D add9 faded by X4-01 +3 s.
- **1C mix** `final/audio/cuts/1C/DragonsKingdom_S01E01_draft-cut_1C_sound.mp4`: program (0-91.5 s) **-16.6 LUFS**
  (whole cut -20.1), TP -1.6 dBTP (AAC -16.7 / -1.4), anchored "dialogue" (+2 dB cap), min dialogue margin 12.6 LU,
  PASS. ASR (`asr_check.py`, pocketsphinx): recall dialogue-alone 0.875 = mix 0.875, nothing lost in the mix
  ("Everything secure?" -> "everything suck your" in both: the model, not the mix). Seen: spectrogram + stem
  waveforms of 26-96 s (scratchpad `eng1/sound/1C-flight-spec.png`, `1C-flight-stems.png`): M6 out by 28 s, M7
  39.5-48, M8 65.5-94.5, beats/rushes per shot. A bright ~1.3 kHz stripe in the spectrogram PNG is a display effect:
  band RMS of ambience/fx/mix at 30-36 s falls smoothly 200 Hz -> 4 kHz (no peak).
- Not re-run for byte-identity this session (new recipes are seeded like the others). NOT listened to by a person.

## Next steps (in order)

1. **Listen** to the 1C `_sound.mp4` 28-95 s: is `flight_wind` (-22) too loud/hissy for 4 minutes of flight in 1D/1E?
   Leaf's `wingbeat_light` rate (0.36-0.45 s) vs his flight animation once 1C-07..19 are rendered - re-time the
   `every_s` to the wing cycle in the director's flight pose (scenes/lib/creatures poses) when shots exist.
2. When the director renders 1C-07..1C-19, re-mix and check beat sync on picture (1C-11 rhythms, 1C-13 approach).
3. X4 (harbour / aerial town), X5 (Cling): spot when specced (`kind` becomes non-missing -> they join the program
   region automatically). Beds needed: harbour (gulls, rigging, water lap, crew voices as walla), market street,
   Cling festival square (replace the `grounds_wind` placeholder); diegetic festival music (separate cue, not ducked
   like score). M8 currently fades in X4-01: extend/re-spot when X4-01..X4-03 exist (shotlist: X4-20 "light theme").
4. If 1C program stays below -16 when all shots exist, the dialogue cap is binding: raise music/beds rather than the
   cap (margin is 12.6 LU, 2.6 LU of room).
5. Earlier items below still stand (listen 1A/1B, M6 basses re-render check, VSCO 2 CE via sfizz for the final, per-line
   voice treatment, episode-timeline mix).

## State (2026-11-01, session 4: 1B score + 1C takeoff)

- Done: three new ORIGINAL cues as note data in `music/scores.mjs` (shared helpers `leafFig` = Leaf's light figure
  A . B D - B A | F# A B D, and `pulse`), spotted in `music/cues.json`:
  - **M4 riding grounds** (`riding_grounds`, beat 0 = 1B-02, 60 bpm so beat = 1B cut time - 4 s; faded by X3-16 +3 s):
    D pedal with D-Bb-C chord colours (quiet tension/awe), the flute figure for Leaf and Abby at 1B-04 / 1B-10 / X3-06
    and a clarinet answer (1B-05 gap, a falling version on X3-08 after the keeper's last line), tremolo + low horns as
    Charcoal lowers (X3-02) and a cello climbing a D-minor scale up the rig (X3-03..05), the dawn theme's head on a soft
    horn after "Morning." (X3-14/15), thin under the pipe (R2-01). target -20.5, duck 12.
  - **M5 ready** (`ready`, beat 6 = 1B-13): low fifth under 1B-12, alert pizz/flute at 1B-13, the figure + harp run +
    swell to A major as Leaf rises (1B-15), held to the last frame. target -21, duck 12.
  - **M6 takeoff** (`takeoff`, beat 0 = 1C-01, ends by 1C-07 with a 3 s fade): Leaf's figure fast, horns/basses build
    D-Bb-C as Charcoal gathers, tremolo + timpani roll on A (1C-04), full D major tutti with the dawn theme on the
    massive downbeat (1C-05), higher second swell (1C-06). target -19, duck 9.
- 1C added to the mixer: `beds.json` sets SKY_OFF_VERDOR/VERDOR_AERIAL -> vista_wind_sea, VERDOR_HARBOR/OUTER_ROCKS ->
  sea_shore, CLING_SQUARE -> grounds_wind (placeholder, needs a square/festival bed); `fx/spots.json` 16 rows for
  1C-01..1C-06 (claws, quick light wingbeats for Leaf, breath/membrane/vault for Charcoal, huge downbeats, turf tear,
  stone clatter, rolling wind, settling dust); `mix.mjs` handles a cut with no voice takes (`NO_DIALOGUE`: dialogue
  gain 0, same +2 dB master cap, `anchored: "reference"`).
- Mixes (seen: `1B-stems.png` music spectrogram + music/dialogue/fx waveforms 0-138 s: ducks line up with every line,
  flute figures in the gaps; `1C-takeoff.png` mix spectrogram + stems 0-30 s):
  - `final/audio/cuts/1B/DragonsKingdom_S01E01_draft-cut_1B_sound.mp4`: **-16.1 LUFS**, -1.6 dBTP (AAC -16.2 / -1.4),
    min dialogue margin 11.3 LU (window 25.7-31.2, the 1B-06 exchange), PASS; re-run byte-identical (sha256 b93c6923...).
  - `final/audio/cuts/1C/DragonsKingdom_S01E01_draft-cut_1C_sound.mp4`: -23.0 LUFS over 382 s (354 s are slates with
    wind only, anchored "reference"); the rendered takeoff 0-28 s alone measures -16.4 LUFS. TP -1.6.
  - PROLOGUE-TITLE-1A not re-mixed this session (no change affects it: new cues/spots key to 1B/1C shots only).
- NOT listened to by a person.

## Next steps (in order)

1. **Listen** to the 1B and 1C `_sound.mp4` (and 1A). By ear: M4 flute figure may be too cute against "quiet tension"
   (lower `flute (Leaf)` velocities or drop the 1B-10 statement at beat 36.5); the X3-02 low-horn Bb chord vs
   Charcoal's breath (fx) - both sit in the low end; the 1C-05 downbeat: music tutti + wingbeat (-9 dB peak) drive the
   limiter at 18.5-19 s - if it pumps, lower `wingbeat` 1C-05 to -12 or M6 target to -20.
2. After a 0.4 s gap at 6.9-7.3 s in M6 (strings end before basses entered) the basses were moved to beat 6.5 - the
   re-render was mixed but the picture was NOT re-made: check `music.wav` 5-9 s (`--keep-work`).
3. If the director re-times 1B, re-check M4: it has ONE sync point (1B-02) and is written on 1B's current timings
   (comments in `scores.mjs` give beat = cut time - 4). If shots move, split M4 into per-section cues synced to
   1B-04 / X3-01 / X3-06 / X3-14 (cue sheet supports any number of cues) instead of re-writing beats.
4. 1C flight (1C-07..1C-19, X4-*): "Music stops; only wingbeats", "light theme" at 1C-10/1C-15/1C-18/1C-19/X4-20
   (Leaf's figure is the light theme's seed: build a lighter version of the dawn theme with it), wind beds for
   SKY_OFF_VERDOR (louder, with gusts) and harbour/Cling beds; spot X4 sounds (gulls, boat bell, crew, market) - synth
   or CC0 with manifest rows first. Score only once those shots are rendered (they are slates now).
5. Earlier open items still stand (below): numeric fx-vs-bed level check, picture sync check of spot offsets, better
   instrument samples for the final (VSCO 2 CE CC0 via sfizz), per-line voice treatment, episode-timeline mix.

## State (2026-11-01, session 3: spot effects)

- Done: **spot effects** for PROLOGUE+TITLE+1A and 1B. `fx/spots.json` (spot sheet keyed to EDL shot ids, 134 rows ->
  267 events in 1A, 85 in 1B), `fx/synth.mjs` (31 recipes, all synthesised in JS from seeded noise / impulse trains /
  partials; no recordings), `fx/fx.mjs` (placement, repeats, pan, duck under speech, Freeverb-style reverb per space,
  fx stem WAV; byte-identical re-runs, checked by sha256 on 1B), wired into `mix.mjs` as a 4th stem (`--no-fx` to omit).
  Manifest row `fx-procedural`, credits.txt "sound effects synthesised for the series", credits-notes.md paragraph.
- Spotted: T-01 +6 s egg scratch (alone, no duck); 1A-01 tick + running crack + inner scrape; 1A-06..1A-12 shell creak,
  ticks, fragment on bedding, wet scrape, shell breaks, laboured hatchling breaths, straw rustle; footsteps on stone
  (X1-01, X1-05, 1A-03, 1A-20, 1A-31/32, X2-04..07, corridor reverb), straw (1A-20 careful steps), timber stair
  (X3-03/04, X3-16), turf; gown/linen cloth; knocks (X1-03, second cut short), latch, doors; Leaf breaths/snorts/claws;
  Charcoal's huge exhales (1B-01 match cut, X3-02, X2-08 off R), weight shift with ground creak (X3-02), rig chains
  (1B-02, 1B-05, X3-02/03/05/09), buckles/leather; P-06/P-17 wingbeats; wind through grass (P-17, X2-08, 1B, X3-04/05).
  Nothing at 1A-15 (whisper alone) or 1A-25 (room tone only).
- Mixes (seen: spectrograms of the fx stems 92-122 s (1A) and 44-68 s (1B), stem waveforms 294-320 s and 98-118 s):
  - `final/audio/cuts/PROLOGUE-TITLE-1A/DragonsKingdom_S01E01_draft-cut_PROLOGUE-TITLE-1A_sound.mp4`: -16.1 LUFS,
    -1.6 dBTP (AAC -16.1 / -1.6), dialogue over ambience+music+fx min 11.6 LU (window at 55 s, no fx there), PASS.
  - `final/audio/cuts/1B/DragonsKingdom_S01E01_draft-cut_1B_sound.mp4`: -18.1 LUFS (anchored on dialogue: words capped at
    -15 LUFS, no music in 1B yet), -1.6 dBTP (AAC -1.4), min margin 13.9 LU, PASS.
- NOT listened to by a person. Levels are set by numbers + pictures only: `defaults.stem_gain_db` = +4 dB (raised after
  the first pass looked ~20 dB under dialogue peaks).

## Next steps (in order)

1. **Listen** (Daxtyn / director) to both `_sound.mp4`. Tune by ear: `defaults.stem_gain_db` (whole fx level), per-row
   `gain_db` in `fx/spots.json`; the synthetic steps may read too clicky -> lower `step_stone` heel band or raise `soft`.
   Charcoal's breath (`breath` size 1) has a lot of sub (20-60 Hz rumble): fine on a PC, check on small speakers.
2. Numeric level check not done: per featured moment compare fx momentary loudness vs the bed (run `mix.mjs --keep-work`,
   then `ebur128=framelog=info` on `audio/.work/<cut>/fx.wav` and `ambience.wav`; my awk parser failed, use node).
3. Sync check against picture: offsets in `spots.json` were set from shotlist action text + shot lengths, not from
   watching frames. Step through the draft cuts at the spotted shots (X1-03 knocks, X1-06 latch, 1A-08 fragment, 1A-22
   knee, X3-02 lowering, X3-03 stair) and nudge `at`.
4. 1B mix is -18.1 LUFS because there is no music in 1B: score the 1B ground scene (or allow MAX_DIALOGUE_I -14 for 1B).
5. Better sources for a final: CC0 recordings (Freesound CC0 filter only; Sonniss GDC bundles are NOT CC0) for
   footsteps/cloth/chains could replace or layer with the synth recipes; add a `file` sound type to `fx.mjs` (load WAV,
   peak-normalise) and a manifest row per file (URL, author, licence) BEFORE use.
6. Spot the rest of the episode from shotlist `sound` notes (1C onward) as the director's cuts appear; per-line voice
   treatment (chamber reverb); episode-timeline mix; music next steps from the previous session below.

## Gotchas (fx)

- Reverb tails decay into float denormals and made the stem 3x slower: the comb input gets +1e-18 (keep it).
- `fx.mjs` writes a 44-byte-header float WAV; `checkLen()` assumes ffmpeg's 80-byte header (36 bytes = 0.1 ms, within
  tolerance).
- Spot rows whose shot is not in the cut are skipped (counted in the report as `spot_rows_not_in_cut`).

## State (2026-10-30, session 2: music)

- Done: `mix.mjs` (deterministic, re-runnable: dialogue + ambience + music stems), `beds.json` (7 synthesised beds),
  **music**: `music/scores.mjs` (3 original cues as note data), `music/cues.json` (cue sheet keyed to EDL shot ids),
  `music/midi.mjs` (SMF writer), `music/render.mjs` (FluidSynth + Fluid R3 GM, MIT; byte-identical re-renders,
  checked), `manifest.json` rows (music-original, soundfont-fluidr3-gm, fluidsynth) + `credits.txt` "Music" block +
  `credits-notes.md` paragraph.
- Mixed with music: PROLOGUE-TITLE-1A ->
  `final/audio/cuts/PROLOGUE-TITLE-1A/DragonsKingdom_S01E01_draft-cut_PROLOGUE-TITLE-1A_sound.mp4`
  (357.5 s; -16.1 LUFS integrated, -1.6 dBTP, AAC copy -16.2 LUFS / -1.5 dBTP, LRA 22.6; dialogue over ambience+music min 11.7 LU, PASS; `reports/PROLOGUE-TITLE-1A.json`). 1B is unchanged (no cue syncs to a 1B shot; it would be skipped).
- Placement (seen on a spectrogram + stem waveforms of 60-205 s): M1 enters 71.0 s (after the P-15 narration ends at
  70.3), dips under the P-16/P-17 narration, swells into M2 at the title cut (95.0) and is gone by ~100 s; M3 runs
  157.0-196.0 s, ducked under the 191 s line, silent at the 1A-15 whisper. Dialogue over ambience+music >= 13.6 LU
  in every music window. NOT listened to by a person yet.

## Music next steps (session 2)

1. **Listen** (Daxtyn / director): the `_sound.mp4`. Likely tuning by ear: `target_lufs` per cue in `music/cues.json`
   (M1 -24, M2 -21, M3 -28), horn vs strings balance in `scores.mjs` (`volume`/velocities), the M3 pizzicato
   heartbeat may read as too literal - halve its velocities or drop it before beat 24.
2. Music is the General-MIDI Fluid R3 soundfont: fine for drafts, thin for a final. For the final mix, render the same
   `scores.mjs` with a better free orchestral library, e.g. **VSCO 2 Community Edition** (CC0, sfz) via `sfizz`
   (BSD-2), or **Sonatina Symphonic Orchestra** (CC Sampling Plus - check terms before use). Add a manifest row first.
   `render.mjs` would get a `--engine sfizz` path; keep the GM render as fallback.
3. More cues for the rest of the episode from shotlist `sound` notes (e.g. the light theme in 1D, "Music stops; only
   wingbeats" in the flight, "Music returns softly", the festival tune in Cling = diegetic, the musician's instrument:
   compose as a separate diegetic cue, panned to the music space, NOT ducked like score). Shotlist line refs:
   `grep -n '"sound": .*[Mm]usic' final/shotlist.json`. Do not score 1D's "no music telling the audience what to feel".
4. (DONE 2026-11-01, see session 3 above) **Spot effects** (shotlist `sound` notes): `sound/fx.json` (events: shot + offset, sound id, gain, pan) and an fx stem
   in `mix.mjs`. CC0 first (Freesound CC0 filter; Sonniss GDC bundles are NOT CC0), else synthesise (shell tick, latch,
   footsteps on stone, gull, wingbeat, egg scratch at T-01 +6 s). Every source: manifest row + credits.
5. Per-line voice treatment from `vo/takes.json` mix hints (reverb for the chamber, outdoor EQ).
6. Episode mode: mix on the EPISODE timeline (render/episode.mjs plan) -> `final/audio/S01E01_mix.wav`; then
   `pc/pack-sound.mjs mix` ships it. Stems (dialogue / ambience / fx / music) for the PC if wanted.

## Gotchas

- FluidSynth (libsndfile) writes a PEAK chunk with a timestamp: the raw WAV differs by one header byte each run.
  `render.mjs` re-writes the samples with ffmpeg `+bitexact`, so the cue WAVs are byte-identical.
- FluidSynth renders ~4 s past the last MIDI event (reverb tail); `length_beats` adds an end marker so tails are kept.
- Music cues are placed with `adelay=delays=<n>S` (samples) after the per-cue fade + duck in cue-local time
  (`duckExpr(db, shift)`), so ducking is exact on the cut timeline.
- An `amix` fed by `adelay`-ed inputs starts at the first delay unless followed by `aresample=async=1:first_pts=0`;
  `checkLen()` refuses stems that do not match the cut length.
- `ebur128` cannot be added with `-af` to a `-filter_complex` output: `measure()` appends it inside the graph.
- `alimiter` must have `level=0` and `latency=1`.
- Bed calibration is cached in `<work>/bed-cal.json`; music renders in `<work>/music/` keyed by MIDI + versions.
