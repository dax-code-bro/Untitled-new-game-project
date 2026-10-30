# Sound track: progress (for the next session)

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

## Next steps (in order)

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
4. **Spot effects** (shotlist `sound` notes): `sound/fx.json` (events: shot + offset, sound id, gain, pan) and an fx stem
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
