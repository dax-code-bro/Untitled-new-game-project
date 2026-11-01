# Sound track: progress (for the next session)

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
