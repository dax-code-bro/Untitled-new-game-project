# Episode 1 voice takes (shooting script, computer voices)

These are temporary computer-voice takes for **every spoken line of the locked shooting script**
(`../screenplay-final.md`, broken down in `../dialogue.json`). They are for the animatic and the timed
edit. **Daxtyn has not approved any of them.** A real recording replaces any take; for Abby, Remi,
Alexandria and the King of Cling that is recommended (`../voices.json` → `human_recordings`).

The lines come from three places:
- the handoff (198 lines);
- the proposed additions (171);
- the proposed rating pass (16).

The additions and the rating pass stay proposals until Daxtyn accepts them (`SERIES.md` section 5). Taking a
voice for a line does not make it canon.

**`takes.md` is the summary.** It lists the counts, the cast, the times per scene, the list for real
recording and the check results. The script writes it, so do not edit it by hand.

## What is here

| File | What it is |
|---|---|
| `<line_id>.wav` (384 files) | One dry take per line, named by its `dialogue.json` id (`L048.wav`, `X17-11.wav`, `R14-01.wav`, ...). 48 kHz, mono, 24-bit PCM. |
| `R13-01.PLACEHOLDER.wav` | The vendor's sung verse, read in rhythm. A **stand-in**, not a performance. |
| `nonverbal/NV-*.PLACEHOLDER.wav` (4 files) | Stand-ins for the screams and cries the screenplay asks for (see below). |
| `takes.json` | One record per line. It has the exact text, the TTS input, the phonemes, the role, the voice and settings, the treatment and why, mix hints (gain, room, wind, overlaps), shots, sentence timings, level, sha256 and every check result. It also has the placeholders, the list for real recording and a measured comparison of the voices. |
| `words.json` | Word start and end times inside each file, from forced alignment. Use them for subtitle timing and mouth shapes. |
| `takes.md` | The summary for people. |
| `repeat-check.json` | The last determinism check (`--repeat-check sample`). |

The WAVs are not in git (about 93 MB). `../tools/make_final_vo.py` rebuilds them; on this machine the
rebuilt files are byte-identical every time. See `../tools/README.md` for setup.

Every file has the same speech level: -20 dBFS RMS over the voiced part, with peaks no higher than -3 dBFS.
The takes have no reverb, wind or music. Each record's `mix` entry says how loud the line should sit in the
mix: whispers about -11 dB, quiet lines about -5 dB, shouts about +3.5 dB. It also says which room or sky
the line is in, and whether it needs the altitude wind bed.

## How the takes were made

- **Same method and tools as the preview.** The script imports the preview's `make_vo.py` and uses its
  parts unchanged: the Kokoro engine, the whisper, quiet, pain, shout and command treatments, the de-esser,
  the limiter and the level matching. The preview's own settings for L001-L078 are unchanged too. **75
  takes come out byte-identical to the preview takes**, which proves the method and the voices did not
  drift. The other 3 preview lines are L048, L053 and L054, which now use Daxtyn's new wording.
- **One voice per role.** All 26 roles use the voice that `../voices.json` gives them, and no two roles
  share one. The four blended voices (SHIP'S MASTER, KEEPER, ADULT VILLAGER, INSTRUCTOR) mix two allowed
  Kokoro voices, weighted as `voices.json` says. Their first takes are in this folder; nobody has listened
  to them yet.
- **Exact words.** The TTS input is the line's text and nothing else. No bracketed note, speaker name or
  marker is ever spoken.
- **Strong language is spoken as written.** That covers "damned", "bastard", "shit", "bloody", "fuck's"
  and "Fucking", in R2-01, X8-01, R6-01, X12-17, R14-01 and X26-01. Nothing is bleeped or respelled. The
  aligner finds each word in the audio.
- **Performance.** Each take's `performance.why` says where its treatment comes from:
  - the line's delivery note;
  - `voices.json` → `special_lines`;
  - or the rules below.

  The treatments used:
  - whispers: L011, X27-01;
  - quiet and low lines;
  - shouts and raised calls in 1E/1F, at the harbor and in Cling;
  - firm and quiet commands (Queen Fall's "Attack." has no shout);
  - cut-off lines: the take stops 75 ms before the natural end of its last word, so the next speaker can
    cut in;
  - a breathless entrance (X1-01, X22-08);
  - Abby in pain: `pain` for her "through pain" lines;
  - Abby hurt: a lighter `hurt` treatment for her other lines after the pass. `voices.json` says pain
    "narrows her voice without eliminating her personality (1E onward)".

  All of these are our own directing choices for a scratch track, and every one can be changed.

## Daxtyn's decisions of 2026-10-18 in these takes

1. **Species lines.** The five lines Daxtyn approved are spoken word for word in the new wording: L048
   "Why couldn't I get one like Charcoal?", L053 "Smaller ones are faster. More versatile.", L054 "And big
   ones?", L109 "...A small dragon. Fast." and X17-11 "I still want one like Charcoal.". The script checks
   them against the shooting script's `[creator-approved wording 2026-10-18]` cues. The old wording is
   never recorded, and no take names a species. L048 replaces Daxtyn's own [ORIGINAL] line. His three
   other [ORIGINAL] lines (L011, L046, L047) are checked byte for byte against the handoff, CANON LOCK item
   8 and the shooting script.
2. **Deaths in Cling.** Nothing spoken changed. The deaths are picture and sound design.
3. **Remi is an adult.** His "you little bastard" (X8-01) is spoken as written. No child speaks a strong
   word.
4. **Final rendering on Daxtyn's PC.** These takes are audio files made on the cloud machine, and they are
   not in git. **Copy this whole `vo/` folder to the PC** together with the mix when the sound is
   assembled. Re-making the takes on Windows or macOS has not been tested, and they could come out a
   little different there (`../tools/README.md`).

## Must be recorded by a person

Text to speech cannot sing, scream or cry. These five files are **placeholders**, so the edit has
something in the right place for the right length. Each is labelled three ways:
- the file name contains `.PLACEHOLDER.`;
- the WAV's INFO comment starts with `PLACEHOLDER`;
- its record in `takes.json` has `placeholder: true`.

| id | who | what | stand-in made with |
|---|---|---|---|
| R13-01 | VENDOR | The sung verse "The miller's wife had flour to sell..." (sung low, badly and happily) | The vendor's voice reading each phrase on a 100 bpm pulse. The tune does not exist yet: it must be newly written for the series. |
| NV-1E-04 | ABBY | Startled breath and cry when the pass wrenches her arm (shot 1E-04) | Abby's voice saying "Ah!" through the pain treatment, after a synthetic gasp (the preview soundtrack's recipe) |
| NV-1F-09 | ABBY | A gasp when she tries to shift her arm (1F-09) | A synthetic gasp and a shaky out-breath |
| NV-1F-14 | the scout rider | The scream as the flame catches (1F-14). It must stay unidentifiable: no gender or age cue. | Procedural synthesis, with no cast voice, so it points at nobody. Layer it with wind. |
| NV-X12-04 | ABBY | A short, sharp cry, cut off by her own breath, when the arm is set (X12-04) | Abby's voice, "Ah!", cut hard, then a sharp in-breath |

These also need people, as groups or from CC0 libraries. No placeholder was made for them:
- the old song at the shared table (X22). It has no lyrics; if it is sung, its words must be newly written;
- the crowd's screams and calls in 3C;
- the distant cries and coughing in 3D;
- festival laughter and walla;
- the breaths and efforts in X3, X14 and X28.

`takes.md` also lists the lines where the computer voice is weakest: the whispers, Abby's pain lines and
the shouts.

## What the checks found

`python -I ../tools/make_final_vo.py --verify` runs every check. It exits 0 only if none fails. The last
run found 0 problems:
- The text of all 385 takes is byte-identical to `dialogue.json`.
- The TTS input has the same words as the text.
- [ORIGINAL] and approved wording: as described above.
- Strong language: as described above.
- Every file is 48 kHz mono 24-bit, at the right level, with a matching sha256.
- Both whispers have no voicing left.
- Each role has one voice, and no two roles share one.
- Abby is silent after the succession question (L046, then L047).
- No dragon speaks.
- The sung line is exactly the placeholder.

**Determinism.** Two separate checks:
- `--repeat-check sample` makes 32 files again in fresh processes and compares them: all 32 are
  byte-identical. The sample has one take per treatment, every blended or pitch-shifted role, a cut-off
  line, a strong-language line and all placeholders.
- 75 takes are byte-identical to the preview's takes from 2026-10-07.

**Intelligibility (pocketsphinx, offline).** 370 of 385 takes are confirmed. The recognizer either hears
every word, or it picks the take's own line out of all 385. The 15 it does not confirm were each checked
again with a fresh recognizer, against a plain read of the same words in the role's own voice and in two
reference voices:
- **1** passes with a fresh recognizer (X5-02).
- **1** is cut off on purpose (L081 "Hold—").
- **6** are confirmed once the role's pitch shift is undone: the child (+4 semitones) and the guard
  (-2). These recognizers are trained on adult voices.
- **6** fail the same way with the role's own voice read plainly, so the treatment is not the cause. These
  are "I know." and "Go." in Abby's voice, Remi's "Yeah, you're good." (L047, identical to the preview
  take) and the child's "I can't see.".
- **1** is worth a listen first: X20-07, the child's "What are you looking at?".

Listen to these 15 before the animatic. The recognizer is a sanity check of the words only. It cannot
judge acting, and nobody has listened to these takes, because this machine cannot play sound.

**Voices that may sound alike.** `takes.json` → `voice_separation` compares each role's pitch and spectral
envelope with every role it shares a scene with. Audition the closest pairs first:
- GUARD / GUARD CAPTAIN (they talk to each other in Cling);
- the GUARD CAPTAIN against the blended INSTRUCTOR, KEEPER and SHIP'S MASTER;
- the WATCHMAN against the INSTRUCTOR, KEEPER and ADULT VILLAGER.

This is a measurement, not a listening test.

## Replacing a take with a real recording

`../voices.json` → `human_recordings` says where a recording goes and how to mark it as the take to use.
Name it by the line's id. Get each person's OK to use their voice (for anyone under 18, a parent's OK
too). Once a recording is chosen for a line, it is used instead of the take here. For a placeholder, the
recording replaces the `.PLACEHOLDER.` file.

## Licences

- **Voices:** Kokoro-82M v1.0 by hexgrad, Apache-2.0 weights. Commercial use is allowed, and no
  attribution is required for the audio. The voices named after a commercial product's voice are never
  cast (`voices.json` → `engines.kokoro.caution`).
- **Processing and placeholders:** our own signal processing (the preview's `make_vo.py` and this
  script). The rider's scream is synthesized from scratch.
- **No third-party audio is used.**
- **Tools** (their licences cover the software, not the audio):
  - kokoro-onnx 0.6.1 and onnxruntime 1.30.0 (MIT);
  - espeak-ng 1.51 and phonemizer 3.4.0 (GPL-3.0-or-later, used as tools);
  - SoX 14.4.2 (GPL/LGPL);
  - NumPy, SciPy and soundfile (BSD-3-Clause), libsndfile 1.2.2 (LGPL-2.1+);
  - only for checking, pocketsphinx 5.1.1 (BSD-2-Clause).
- **Credit:** the same suggested line as the preview, "Temporary voices: Kokoro-82M (Apache-2.0)". No
  computer voice is ever credited as a person.
