# Sound track: progress (for the next session)

## State (2026-10-30, session 1)

- Done: `mix.mjs` (deterministic, re-runnable), `beds.json` (7 synthesised beds), `manifest.json`, credits lines.
- Mixed: PROLOGUE-TITLE-1A -> `final/audio/cuts/PROLOGUE-TITLE-1A/DragonsKingdom_S01E01_draft-cut_PROLOGUE-TITLE-1A_sound.mp4`
  (357.5 s; -16.0 LUFS, -1.6 dBTP; speech over ambience min 11.7 LU, mostly 15-26 LU; LRA 22.7). 1B also mixed
  (138 s, dialogue-anchored at -17.9 LUFS because there is no music yet).
- Seen: waveform of the whole mix (sea swells in the prologue, words well above the beds), spectrogram of 30 s of the
  chamber bed (low room tone, faint hiss, sparse crackles). NOT listened to by a person yet.

## Next steps (in order)

1. Ask Daxtyn (or the director track) to listen to the `_sound.mp4`; tune `beds.json` levels (`target_lufs`) by ear.
   The LRA of 22.7 comes from the very quiet chamber between lines; music and spot effects will fill it.
2. **Spot effects** (shotlist `sound` notes): add `sound/fx.json` (events: shot + offset or rec time, sound id, gain, pan)
   and a `cues` pass in `mix.mjs`. Sources: CC0 first (Freesound CC0 filter, Sonniss is NOT CC0 - check), else
   synthesise (shell tick, latch, footsteps on stone, gull, wingbeat). Every source gets a row in `manifest.json` +
   credits. Download into a new empty folder under the scratchpad, never into the repo; keep audio files git-ignored.
3. **Music** (P-15 onward, title): compose as notes (a small JSON/MIDI score in `sound/music/`), render with a free
   soundfont (e.g. FluidR3_GM, MIT, or GeneralUser GS licence check) via `fluidsynth` if installable, else synthesise.
   Music bus ducks under dialogue like the beds.
4. Use `vo/takes.json` mix hints (room, wind, distance) for per-line treatment (reverb for the chamber, outdoor EQ).
5. Episode mode: mix on the EPISODE timeline (render/episode.mjs plan) and write `final/audio/S01E01_mix.wav` or
   `scenes/<scene>.wav`; then `pc/pack-sound.mjs mix` ships it. Only once the episode timeline equals the cut.
6. Stems for the PC (dialogue / ambience / fx / music) if Daxtyn wants to rebalance there.

## Gotchas

- An `amix` fed by `adelay`-ed inputs starts at the first delay unless followed by `aresample=async=1:first_pts=0`
  (the first run shifted all words 12 s early); `checkLen()` now refuses stems that do not match the cut length.
- `ebur128` cannot be added with `-af` to a `-filter_complex` output: `measure()` appends it inside the graph.
- `alimiter` must have `level=0` (its default auto-level changes loudness) and `latency=1`.
- Bed calibration is cached in `<work>/bed-cal.json` keyed by the recipe and the FFmpeg version.
