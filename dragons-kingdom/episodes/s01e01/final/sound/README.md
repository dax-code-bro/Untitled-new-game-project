# Episode sound: the mixer

`mix.mjs` makes the sound for a draft cut, from data only, and can be re-run at any time (same inputs + same FFmpeg =
byte-identical `mix.wav`; checked: two runs of PROLOGUE-TITLE-1A gave the same sha256).

```
node episodes/s01e01/final/sound/mix.mjs                 # the PROLOGUE + TITLE + 1A cut (cut/edl.json, cut/audio-cues.json)
node episodes/s01e01/final/sound/mix.mjs --cut 1B        # cut/edl-1B.json, cut/audio-cues-1B.json
     [--edl F --cues F --video F] [--out DIR] [--work DIR] [--no-mux] [--keep-work]
```

About 2 minutes for the 6-minute cut on the 4-vCPU cloud machine (all CPU, FFmpeg only; no numpy, no Python).

## What it does

1. **Voice**: every take in `cut/audio-cues*.json` is cut from `vo/<line>.wav` (`file_in_s`..`file_out_s`), given
   `gain_db`, and placed at `rec_s` on the cut timeline. The dialogue stem is high-passed at 70 Hz, lightly compressed
   and set to -17 LUFS integrated.
2. **Ambience**: each shot gets a bed by its set (`beds.json` `sets`, or `shots` for a single shot). Consecutive shots with the
   same bed make one run; runs cross-fade (equal power) over 0.5 s at cuts or over the dissolve length. Every bed is
   synthesised from seeded noise (no recordings), calibrated to its own `target_lufs` and ducked by `duck_db` under
   every speech window (`speech_rec_in/out_s`, 0.2 s attack, 0.35 s release).
3. **Master**: dialogue + ambience, one gain to -16 LUFS integrated, a 4x-oversampled look-ahead limiter at -1.6 dBFS,
   re-measured until true peak <= -1.1 dBTP. The words are never pushed above -15 LUFS: in a cut with sparse dialogue
   and no music yet the mix stays below -16 and the report says `anchored: "dialogue"`.
4. **Checks**: dialogue vs ambience momentary loudness over every speech window (want >= 10 LU), stem lengths equal
   the cut, true peak of the AAC copy.
5. **Outputs** (git-ignored) in `final/audio/cuts/<cut>/`: `mix.wav` (48 kHz 24-bit stereo), a COPY of the draft cut
   with this sound (`..._sound.mp4`, video stream copied unchanged, AAC 256k), the cut's subtitles copied, and
   `mix-report.json`. The committed copy of the report is `sound/reports/<cut>.json`. `final/cut/` is only read.

## Files

| file | what |
|---|---|
| `mix.mjs` | the mixer |
| `beds.json` | ambience recipes (layers of seeded noise, filters, slow swells as FFmpeg expressions in `t`), which set uses which bed |
| `manifest.json` | every sound source and its licence (credits must agree) |
| `reports/<cut>.json` | last mix of each cut: loudness, true peak, sha256, bed runs, speech margins |

## How the mix reaches the render PC

Draft-cut mixes stay here (`audio/cuts/` is not packed). The episode mix, once made on the episode timeline, is written as
`final/audio/S01E01_mix.wav` (or `final/audio/scenes/<scene>.wav`, each starting at the scene's first frame) and shipped
by the existing route (`audio/README.md`): `node pc/pack-sound.mjs mix` packs exactly those files into one deterministic
`.tar` with sha256 values, `--record --url <link>` writes them into `audio/delivery.json`, and the PC's
`pc/build-caches.mjs` downloads, checks and unpacks them before `render/episode.mjs` adds the sound to the scene files.
Alternatively copy the files and run `node pc/build-caches.mjs --only sound --from <folder>` on the PC. The mixer can
also run on the PC itself (Node + the kit's FFmpeg; needs the `final-vo` package there).
