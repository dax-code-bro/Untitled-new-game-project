# Preview soundtrack: S01E01, PROLOGUE through 1E

The full soundtrack of the work-in-progress preview, timed to `../edl.json` to the sample:
14,397 frames at 24 fps = 599.875 s = 28,794,000 samples at 48 kHz. Frame 0 is the first frame
of the WORK IN PROGRESS card.

**Status: provisional, and nobody has listened to it.** This machine cannot play sound. Every
statement below about levels, timing and content comes from measurements (`../tools/check_mix.py`,
results in `check.json`). The voices are temporary computer voices, the effects are procedural
stand-ins and the score is a code-written sketch. Daxtyn has not approved any of it.

## Files

| File | What | In git? |
|---|---|---|
| `preview_mix.wav` | The master: stereo, 48 kHz, 24-bit PCM, −16 LUFS, true peak ≤ −1 dBTP | no (rebuild it) |
| `stems/dialogue.wav`, `stems/music.wav`, `stems/sfx.wav` | Stereo, 48 kHz, 32-bit float, at the master's gain before its peak limiter (float, so nothing clips). Dialogue + music + sfx = the master, except where the limiter acted. The sfx stem holds every effect, ambience bed, wingbeat and the altitude wind. | no |
| `soundtrack.json` | Cue sheet: every placed sound with its frame, start sample, generator and arguments, gain, pan, space, stem and seed key. Also the music cues (notes, MIDI checksum), the ambience levels per shot, the ducking, the mastering measurements and the tool versions. | yes |
| `check.json` | Every measurement from `check_mix.py` | yes |
| `subtitles.json` | The subtitle cues with frames and line ids (for the check) | yes |
| `../preview.en.srt` | English subtitles (UTF-8) | yes |
| `../wingbeats.json` | Wingbeat contract between the sound and the animation (see below) | yes |
| `cache/` | Premaster, limited premaster, music renders and MIDI, Abby's cry | no |

## Rebuild

From `episodes/s01e01/preview/tools/`, with the preview venv (`requirements-vo.txt`) and the
Ubuntu packages `ffmpeg` (6.1), `fluidsynth` (2.3) and `fluid-soundfont-gm` (3.1):

```
python -I make_srt.py            # subtitles (a few seconds)
python -I build_soundtrack.py    # soundtrack, then check_mix.py (11 + 2 min here, on a loaded 4-core machine)
```

The build is deterministic. Every noise source is seeded from a readable key
(`sfx_lib.rng_for`). FluidSynth's file render, Kokoro and ffmpeg's loudnorm are deterministic, so
a second run writes byte-identical files. If a voice take is replaced, re-run `make_vo.py`, then
`build_edl.py`, then these two scripts: the builder refuses takes whose sha256 differs from
`edl.json`.

## What is in it

### Dialogue (78 lines, L001–L078)

- Every take is placed on the sample `edl.json` gives it (`take_start_frame × 2000`).
- L003 is placed as its six EDL parts, including the opened breath between "Sea" and "and".
- Each take goes through a gentle compressor at take level before its line gain, so the
  performance levels in `takes.json` (whisper −11 dB, quiet −5.5, shout +3.5, …) survive:
  - 5 ms RMS detector, −17 dBFS threshold, 3:1, soft knee, 5/120 ms;
  - then a −10 dBTP true-peak ceiling (speech peaks at most 10 dB above the speech level).
- Spaces:
  - narration: dry;
  - birthing chamber: small warm stone room (RT60 0.55 s, send −13 dB);
  - riding grounds: open air (0.45 s, sparse, −20 dB);
  - sky: almost dry (−30 dB), the wind does the work.
- Panning follows the speaker's screen position in the shot (`edl.json` `in_frame`):
  - kept subtle, at ±0.25;
  - off-screen speakers in flight keep their side of the formation: Abby/Leaf left,
    Remi/Charcoal right;
  - "Leaf." (L061) is heard from Leaf's side over the shot of Remi.
- Abby's non-verbal sounds are stand-ins until Daxtyn records them:
  - held breath (1A-25) and ragged breath (1E-07): `make_vo.py`'s breath generator;
  - startled cry (1E-04): her own preview voice saying "Ah!" through her pain processing,
    after a sharp gasp.

  None of them is subtitled.

### Sound effects and ambience (all procedural, `tools/sfx_lib.py`)

Every one of the EDL's 158 sound cues is realized. Of these:

- 85 are one-shot sounds;
- 53 are carried by the ambience layers;
- 20 are wingbeat sync points.

Nine authored additions are drawn from the EDL's beats, each listed with its reason in
`soundtrack.json`:

- the sail filling;
- Remi's footsteps;
- grass under Leaf's next two beats;
- the wings stirring the grass;
- the jaw opening and the soft closed mouth;
- the scout's faint rising whistle;
- Leaf's startled chuff.

Highlights by scene:

- **Prologue.**
  - Waves fold on unseen rocks and fade up from silence. A single distant gull calls, far
    left, and there is no music yet.
  - Open-water wash; rigging creaks L→C as the knarr crosses; the sail fills; water slaps the
    hull; two hard pulls creak the rope.
  - A low pressure above and right, not a roar. A distant wingbeat that is felt more than
    heard moves R→L with the shadow.
  - The sea drops 6 dB around the still sailor.
  - Each landscape has its own bed, cross-faded on its dissolve: wind in trees, distant
    walls, calm sea, heavy swell.
  - The meadow under the match cut, with the grass rushing L→R under one heavy wingbeat.
- **Title and 1A.**
  - A warm stone room tone, faint wind at the high opening, and an oil lamp that hisses and
    flickers.
  - The egg moves through distinct stages:
    - one small scratch;
    - a fine crack that runs and stops;
    - a smaller inner scrape, then a tick under the dialogue;
    - a shell shift and a faint effortful sound;
    - the shell flexing under pressure;
    - a fragment lifted and dropped onto linen;
    - a wet scrape and the effortful breath;
    - one tiny breath, then the break;
    - laboured breathing.
  - Footsteps, gown, latch and door.
  - The bed dips 4 dB for the whisper. Everything pulls back to room tone for the held breath.
  - The hatchling's last tiny breath carries over the match cut into Charcoal's exhale.
- **1B.**
  - Morning birds and light wind.
  - Charcoal's huge slow exhales; strap leather and buckles.
  - An off-screen gate at the far left; Leaf's quick breaths and a small chirr.
  - Saddle and rig creaks, harness clips; claws on turf; Leaf's wings unfolding.
- **1C.**
  - Leaf's first downbeat flattens the grass.
  - The sound drops to a sub layer as Charcoal's huge membranes unfold. The pressure swells
    and the birds stop dead (8268).
  - The launch: a massive downbeat, turf tearing, stones clattering and a rolling dust roar
    that peaks as the dust passes the lens (8496), then debris settling and a second beat
    higher up.
  - In the air:
    - the altitude wind, changing per shot with height, speed and perspective (rider POV
      buffets, wide aerials brighter and smoother);
    - the sea far below over the coast;
    - Charcoal's heavy, infrequent beats against Leaf's quick corrective ones.
- **1D.**
  - Abby's silence is only wind and wingbeats.
  - One immense slow beat (10764).
  - Leaf's beats quicken as he edges in; the small snap of his nip.
  - Charcoal's low breath, no roar.
  - **The music stops dead** at 12135 for the head-in-mouth beat, which is careful and
    non-gory:
    - a slow hinge creak and drawn air;
    - a soft closed-cavity thump;
    - Leaf's muffled squeak;
    - wind up, and nothing with teeth or gore.
  - A short soft wet slip on the release, then Leaf's rapid beats pulling away.
- **1E.**
  - Ordinary flight; the light theme fades out. **No musical warning.**
  - A faint rising whistle at the far right.
  - **The pass**, enters right, R→L, on Leaf's far side:
    - Doppler rush and an N-wave crack at closest approach (13126);
    - the wind swells +8 dB for a second ("the wind overwhelms everything");
    - a violent wake;
    - equipment jolting under load and Abby's startled breath and cry.
  - Leaf's beats turn rapid and uneven until he steadies (13773).
  - The scout's distant thin flutter (2.6 Hz) far right.
  - Charcoal's low breath; heavy beats close.
  - Leaf's beats recede toward Verdor.
  - A low drone and one deep banking beat that rings out into the end card, then silence.
    There is no flame sound: "Attack." is a physical-attack command.

### Wingbeats and the animation (`../wingbeats.json`)

- The tempos come from `scenes/lib/creatures/creature.js` `flapHz`:
  - Leaf 1.6 Hz;
  - Charcoal 0.76 Hz;
  - the scout 2.6 Hz.
- In steady flight a downstroke starts wherever `poses.js` `flight()` has
  `fract(t·hz + phase) = 0`.
  - `t` is the set scene's time (`render-jobs.json` `set_time_start_s`).
  - The phase of each shot is chosen so a downstroke lands on the EDL's cue frame.
- Segments that are not steady list explicit onsets:
  - the corrective double beat;
  - the quickening;
  - the rapid pull-away;
  - the uneven beats after the pass;
  - Leaf's crouch before his first downbeat;
  - Charcoal's glide around the banking beat.
- **The preview scenes are not written yet.** They must animate from this file (or the file must
  be rebuilt from their numbers). Never retime only one side.

### Music (`tools/score.py`)

One motif carries every cue: a low D, then A–D–E–F rising and stopping on F. It is written as
MIDI, played by FluidSynth with the FluidR3_GM strings, harp and flute, and put through a
synthetic hall.

| Cue | Frames | What |
|---|---|---|
| M1 | 1711–2462 | After the narration: one low sustained string tone (D2). At 1805 the restrained rising theme begins. It restates an octave higher across the match cut, peaks under the title, and resolves on D, falling away into the egg's scratch. |
| M2a | 9480–10212 | The lighter flight variant, which carries 1C-15…1D-02: harp, high strings, flute. Its D Dorian B♮ is the brightest moment of the episode. |
| M2b | 10584–12135 | Returns softly after Abby's silence. The harp thins under speech and the flute plays only between lines. Cut dead at the head-in-mouth beat. |
| M2c | 12855–13060 | Returns softly after the release and fades out across 1E-01, with no warning. |
| M3 | 14169–14349 | Low drone (D, tremolo strings, an unresolved low B♭). Not triumphant. |

The EDL's no-music windows are measured as exactly silent: Abby's silence, the head-in-mouth
beat, and everything from 13060 to M3, which includes the pass. The music is ducked 9 dB under
dialogue (150 ms attack, 400 ms release).

### Levels and mastering

- Dialogue is the reference. Beds sit about 15–30 dB under it, the altitude wind about 15 dB
  under it.
- Ducking under lines:
  - the altitude wind ducks 3 dB, as the EDL asks: never removed, so it fills the gaps
    between airborne speakers;
  - other beds duck 4 dB;
  - wingbeats duck 10 dB, because they sit in the speech band.
- Big events (the launch, the pass) go above dialogue level and meet the limiter.
- Mastering:
  1. ffmpeg `loudnorm` pass 1 measures the premaster.
  2. A gain plus a zero-latency 4×-oversampled true-peak limiter (−2.0 dBTP) brings it to
     −16.0 LUFS. This is iterated until the limited file measures −16.0, so pass 2 can stay
     linear.
  3. `loudnorm` pass 2 applies the measured values in linear mode.
- The stems carry the same gain as the master.

## Hand-off to the conform (`../render-plan.md`, delivery)

- **Audio.** Mux `mix/preview_mix.wav` once over the conformed 14,397-frame video as AAC 256k,
  with the video stream copied.
  - Its sample 0 is the first frame of the WIP card.
  - It is already 48 kHz and exactly 28,794,000 samples, so no resampling, padding or offset is
    needed.
  - The AAC encode was measured: −16.0 LUFS, −1.4 dBTP.
- **Subtitles.** Add `../preview.en.srt` as a soft track without re-encoding:
  `ffmpeg -i video.mp4 -i preview.en.srt -map 0 -map 1 -c copy -c:s mov_text -metadata:s:s:0 language=eng out.mp4`
  (the command tested in `audio-plan.md`).
  - The place-name captions (TARA … PROXY SEA) belong in the picture (`edl.json`
    `onscreen_text`), upper-left, away from the subtitle area. They are not in the SRT.

## Verification (`check.json`)

Numbers from the build committed with this README. `check_mix.py` recomputes them all; it ran
52 checks, with 0 failures.

| Check | Measured | Wanted |
|---|---|---|
| Length | 28,794,000 samples = 14,397 frames = 599.875 s (ffprobe 599.875 s); the stems are the same length | the EDL, to the frame |
| Integrated loudness (ffmpeg `ebur128`) | **−16.0 LUFS** (loudness range 16.6 LU) | −16 LUFS |
| True peak | **−2.0 dBTP** | ≤ −1 dBTP |
| After an AAC 256k encode (what `render.mjs` muxes) | −16.0 LUFS, **−1.4 dBTP** | ≤ −1 dBTP |
| `loudnorm` pass 2 | linear; measured −16.00 LUFS in, −15.97 out | linear |
| Every line at its EDL in-point: dialogue stem RMS, first 0.5 s (83 pieces: 77 lines + L003's 6 parts) | quietest −26.6 dBFS (L011, the whisper at −11 dB), loudest −11.4 dBFS | audible (> −45 dBFS) |
| Every take on its EDL sample | best-correlation lag **0 samples** for all 83 pieces; correlation ≥ 0.95 | 0 |
| Each line starts where the EDL places it | ≥ 38.4 dB above the 0.25 s before the take, for every piece | ≥ 15 dB |
| Line levels | within 0.8 dB of take + line gain + compressor + master gain | ±1.5 dB |
| Dialogue over music + effects (whole line) | min **8.4 dB** (L059), median 16.6 dB | clear |
| Airborne lines (37) over wind + wingbeats | min 8.4 dB, median 10.9 dB | intelligible |
| Ground lines (41) | min 10.4 dB, median 23.1 dB | |
| Wind between airborne speakers (18 gaps of 0.15–2 s) | −34.1 to −19.7 dBFS in the gaps (median −27.4), never removed | present |
| Panning | every off-centre line's louder channel matches its screen side | yes |
| No-music windows (Abby's silence; the head-in-mouth beat; 13060 → M3, including the pass) | music stem **exactly silent** | silent |
| M2b at frame 12135 | −33.9 dBFS just before, exactly silent after | stops dead |
| Abby's silence (L046 end + 0.6 s → L047) | dialogue stem exactly silent; nothing placed there | silent |
| Narrator | speaks only L001–L005 | |
| Fire/flame sounds | none | none ("Attack." is physical) |
| Head (WIP card) / tail | exactly silent / last 0.1 s −74 dBFS peak | |
| Stems sum | dialogue + music + sfx = master to −109 dB outside the limiter's regions | |
| Master limiter | max 9.0 dB at the launch; on dialogue a median 0.6 dB on the 54 lines it touches. Over 2 dB only on L071/L070 (Remi's shouts after the pass, +3.5 dB by design: 5.5/5.3 dB), L077 (3.3 dB) and L037 (the called "The field's clear.", 2.8 dB). | |
| Subtitles | 83 cues for 78 lines; text = `dialogue.json` `subtitle_cues` exactly; each line's first cue on its EDL in-point; ≥ 2 frames apart; frame-aligned | |
| Wingbeats | 426 Leaf and 181 Charcoal downstrokes; every EDL wingbeat cue is a downstroke; steady tempo exactly 1.6 / 0.76 Hz | |

Eleven quick replies hold their subtitle 0.79–0.96 s instead of the 1.0 s reading minimum: the
next line starts sooner, and cues never overlap.

## Known limits and what to do next

- **Listen to it.** Nobody has. Start with:
  - the pass and its aftermath (9:06–9:20);
  - the launch (5:46–5:57);
  - the head-in-mouth beat (8:25–8:32);
  - the egg stages (1:43–2:43);
  - the gull at 0:05. A synthetic gull is the riskiest sound here; replace it with a
    recording or a checked CC0 file.
- 41 of the effects are sounds whose EDL source is foley or a recording, wholly or partly.
  These are procedural stand-ins for now, and `soundtrack.json` flags them
  `stand_in_for_foley`. Recorded leather, cloth, footsteps, doors, gravel and grass will sound
  better; `audio-plan.md` shows how to record them at home.
- Abby's cry is a computer voice saying "Ah!". A real cry from whoever voices Abby should replace
  it (`CUES["abby_cry"]` in `soundtrack_shots.py`).
- The FluidR3_GM strings sound dated. The score is a sketch of the intended shape, not a final
  orchestration.
- The wingbeats assume the scenes will animate from `../wingbeats.json`. If the animation is
  built differently, change `soundtrack_shots.py` (HZ, TEMPO, FLIGHT) and rebuild.
- All level choices are by numbers and convention, not by ear. The per-shot tables in
  `tools/soundtrack_shots.py` are the place to adjust anything after a listen.
