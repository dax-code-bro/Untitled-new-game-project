# Episode sound: the mixer

`mix.mjs` makes the sound for a draft cut, from data only, and can be re-run at any time (same inputs + same FFmpeg =
byte-identical `mix.wav`; checked: two runs of PROLOGUE-TITLE-1A gave the same sha256).

```
node episodes/s01e01/final/sound/mix.mjs                 # the PROLOGUE + TITLE + 1A cut (cut/edl.json, cut/audio-cues.json)
node episodes/s01e01/final/sound/mix.mjs --cut 1B        # cut/edl-1B.json, cut/audio-cues-1B.json
     [--edl F --cues F --video F] [--out DIR] [--work DIR] [--no-mux] [--no-music] [--no-fx] [--keep-work]
node episodes/s01e01/final/sound/music/render.mjs [--out DIR] [cue ...]   # render the music cues alone (MIDI + WAV)
```

Needs `fluidsynth` and the Fluid R3 GM soundfont for the music (Ubuntu: `apt install fluidsynth fluid-soundfont-gm`;
elsewhere set `FLUIDSYNTH=` and `DK_SOUNDFONT=`). `--no-music` mixes without them.

About 2 minutes for the 6-minute cut on the 4-vCPU cloud machine (all CPU, FFmpeg only; no numpy, no Python).

## What it does

1. **Voice**: every take in `cut/audio-cues*.json` is cut from `vo/<line>.wav` (`file_in_s`..`file_out_s`), given
   `gain_db`, and placed at `rec_s` on the cut timeline. The dialogue stem is high-passed at 70 Hz, lightly compressed
   and set to -17 LUFS integrated.
2. **Ambience**: each shot gets a bed by its set (`beds.json` `sets`, or `shots` for a single shot). Consecutive shots with the
   same bed make one run; runs cross-fade (equal power) over 0.5 s at cuts or over the dissolve length. Every bed is
   synthesised from seeded noise (no recordings), calibrated to its own `target_lufs` and ducked by `duck_db` under
   every speech window (`speech_rec_in/out_s`, 0.2 s attack, 0.35 s release).
3. **Music**: `music/cues.json` is the cue sheet, keyed to EDL shot ids: beat `sync.beat` of a score lands at the
   start of shot `sync.shot` (+ offset), `end_by` fades it out before a named shot; a cue whose shot is not in the cut
   is skipped. The scores are original note data in `music/scores.mjs` (M1 dawn theme from the end of the P-15
   narration to the title, M2 title sting resolving on T-01 and falling away for the scratch, M3 hatching 1A-05..1A-14,
   tense pedal + rising cello, turning tender at 1A-13, silent before the 1A-15 whisper). `music/render.mjs` writes
   them as MIDI (`music/midi.mjs`) and renders them with FluidSynth + Fluid R3 GM (MIT) at 48 kHz float, one core,
   fixed reverb, no dither: byte-identical on re-render (checked), cached by a key of MIDI + versions. Each cue is set
   to its `target_lufs` and ducked by `duck_db` under the speech windows.
3b. **Spot effects**: `fx/spots.json` is the spot sheet, keyed to EDL shot ids like the music: each event plays a sound at
   shot start + `at` s (optional `repeat` with spacing, jitter, alternating params; `gain_db` = peak level, `pan`/`pan_to`,
   `duck_db` under speech, default 3). Every sound is a recipe in `fx/synth.mjs`, synthesised in JavaScript from seeded
   noise, impulse trains and decaying partials (no recordings): `step_stone|straw|wood|turf`, `knee_stone`, `cloth`,
   `hide_rub`, `chain_rattle`, `buckle`, `leather`, `rope_creak`, `breath` (size 0 hatchling .. 1 Charcoal; inhale/exhale),
   `hatchling_strain`, `weight_shift`, `claws_turf`, `snort`, `egg_scratch`, `shell_tick|crack|creak|break`,
   `fragment_click`, `wet_scrape`, `wind_grass`, `wingbeat` (Charcoal), `wingbeat_light` (Leaf: quicker, smaller;
   **flight beats are phased to the animation**: `poses.flight` starts every cycle at shot time 0 with the wings up and the
   downstroke over the first 57 %, so mid-downstroke = 0.285 x period + k x period; Leaf 1.25 s (0.8 s at hz 1.25),
   Charcoal 1.6 s (hz 0.625) - set `at` = mid-downstroke - the recipe's peak time, no jitter),
   `air_rush` (flight air past camera; `dark`, `whistle`), `knock`, `latch`, `door`, `pipe_tap`, `runners`. `fx/fx.mjs`
   places them, sends each to the reverb of its space (`space_of_set`: stone corridor, stone room, open, sea, air = almost dry for the sky) and writes the
   fx stem; byte-identical on re-run (checked). `defaults.stem_gain_db` sets the whole fx level by ear. Render the stem
   alone: `node episodes/s01e01/final/sound/fx/fx.mjs --cut 1B --out /tmp/fx.wav`.
4. **Master**: dialogue + ambience + music + fx, one gain to -16 LUFS integrated, a 4x-oversampled look-ahead limiter at -1.6 dBFS,
   re-measured until true peak <= -1.1 dBTP. The words are never pushed above -15 LUFS: in a cut with sparse dialogue
   and no music yet the mix stays below -16 and the report says `anchored: "dialogue"`.
   A cut with no voice takes (1C so far: 6 takeoff shots + slates) keeps the same +2 dB cap, so beds/music/fx sit at
   the level they have in the dialogue cuts instead of a slate-heavy cut's wind bed being pushed to -16 (report:
   `anchored: "reference"`; 1C's rendered takeoff, 0-28 s, measures -16.4 LUFS on its own).
   **Program region**: loudness (I, LRA) is measured only over the shots that have a picture spec (EDL `kind` !=
   `missing`), so a cut that is still mostly slates for unspecced shots (1C: 1C-01..1C-19 = 0-91.5 s of 382 s; X4/X5
   are slates) is normalised on its real scenes; the slates keep the same gain (beds only). The report gives `I`
   (program) and `I_full` (whole cut, info) and `program.windows_s`; a cut with no missing shots is unchanged.
5. **Checks**: dialogue vs ambience + music + fx momentary loudness over every speech window (want >= 10 LU), stem lengths equal
   the cut, true peak of the AAC copy.
   Machine listen-check: `python3 -I episodes/s01e01/final/sound/asr_check.py --cut 1C` (after `mix.mjs --keep-work`;
   needs `pip install pocketsphinx`) decodes every line from the dialogue stem alone and from the mix and compares word
   recall with the script -> `reports/<cut>-asr.json` (`lost_in_mix` must be empty).
6. **Outputs** (git-ignored) in `final/audio/cuts/<cut>/`: `mix.wav` (48 kHz 24-bit stereo), a COPY of the draft cut
   with this sound (`..._sound.mp4`, video stream copied unchanged, AAC 256k), the cut's subtitles copied, and
   `mix-report.json`. The committed copy of the report is `sound/reports/<cut>.json`. `final/cut/` is only read.

## Files

| file | what |
|---|---|
| `mix.mjs` | the mixer |
| `beds.json` | ambience recipes (layers of seeded noise, filters, slow swells as FFmpeg expressions in `t`), which set uses which bed |
| `music/scores.mjs`, `music/cues.json` | the score as note data; the cue sheet (shot-id sync, levels, ducking) |
| `music/midi.mjs`, `music/render.mjs` | SMF writer; FluidSynth render with cache (audio git-ignored) |
| `fx/spots.json`, `fx/synth.mjs`, `fx/fx.mjs` | the spot sheet (shot-id events); the effect recipes; placement, ducking, reverb, fx stem |
| `manifest.json` | every sound source and its licence (credits must agree) |
| `reports/<cut>.json` | last mix of each cut: loudness, true peak, sha256, bed runs, speech margins |
| `asr_check.py`, `reports/<cut>-asr.json` | pocketsphinx intelligibility check: dialogue alone vs mix |

## How the mix reaches the render PC

Draft-cut mixes stay here (`audio/cuts/` is not packed). The episode mix, once made on the episode timeline, is written as
`final/audio/S01E01_mix.wav` (or `final/audio/scenes/<scene>.wav`, each starting at the scene's first frame) and shipped
by the existing route (`audio/README.md`): `node pc/pack-sound.mjs mix` packs exactly those files into one deterministic
`.tar` with sha256 values, `--record --url <link>` writes them into `audio/delivery.json`, and the PC's
`pc/build-caches.mjs` downloads, checks and unpacks them before `render/episode.mjs` adds the sound to the scene files.
Alternatively copy the files and run `node pc/build-caches.mjs --only sound --from <folder>` on the PC. The mixer can
also run on the PC itself (Node + the kit's FFmpeg; needs the `final-vo` package there).
