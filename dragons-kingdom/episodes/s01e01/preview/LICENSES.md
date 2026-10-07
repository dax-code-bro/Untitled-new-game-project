# Preview licenses: S01E01 work-in-progress video

Everything used for the preview is free and runs offline. This file lists every voice and every tool,
with its license, so the preview (and anything later built from it) can be posted publicly.

Status: the preview voices are **provisional computer voices** (scratch takes). Daxtyn has not approved
them. Any line can be replaced by a real recording, and for Abby, Remi, Alexandria and the narrator
that is recommended (see `../audio-plan.md`).

## Voices used (dialogue L001-L078, PROLOGUE through 1E)

All six voices come from one model, **Kokoro-82M v1.0** by hexgrad. The weights are **Apache-2.0**:
commercial use is allowed, and no attribution is required for the audio it produces. Sources checked
from this machine on 2026-10-07:

- hexgrad/kokoro README (GitHub): "With Apache-licensed weights, Kokoro can be deployed anywhere from
  production environments to personal projects."
- thewh1teagle/kokoro-onnx README (GitHub): "kokoro-onnx: MIT; kokoro model: Apache 2.0".

| Role | Kokoro voice | Language | Speed | Lines in range | License |
|---|---|---|---|---|---|
| NARRATOR | `bf_emma` | en-gb | 0.85 | 5 | Apache-2.0 |
| ALEXANDRIA | `af_kore` | en-us | 0.90 (L011 whisper at 0.80) | 10 | Apache-2.0 |
| ATTENDANT | `af_river` | en-us | 0.95 | 4 | Apache-2.0 |
| ABBY | `af_heart` | en-us | 1.00 | 28 | Apache-2.0 |
| REMI | `am_michael` | en-us | 0.95 | 30 | Apache-2.0 |
| GROUND KEEPER | `am_fenrir` | en-us | 0.95 | 1 | Apache-2.0 |

- The casting is `voices.json`'s primary choice for each role, **unchanged**. Every role there was
  already a Kokoro voice, so no license-driven change was needed. Quality could not be judged by ear
  (no listening is possible on this machine), and an offline speech-recognition check found no
  unintelligible voice, so there was no measured reason to recast.
- One voice per role, and no two roles share a voice (checked by `tools/make_vo.py`).
- Per-line performance processing (whisper, quiet, pain, shout, firm command) is our own signal
  processing applied to these voices. It adds no third-party material.
- Model files: `kokoro-v1.0.int8.onnx` (sha256 `6e742170…06cb`) and `voices-v1.0.bin`
  (sha256 `bca610b8…bf7d`) from the kokoro-onnx release `model-files-v1.0` on GitHub.
- **Caution, carried over from `voices.json`:** Kokoro's model card (on Hugging Face, which is blocked
  from this machine, so not re-checked) describes its training audio as permissive and public-domain
  recordings plus synthetic audio from closed commercial TTS models. To stay clear of imitating a
  commercial product's voice, the voices named after one (`af_alloy`, `af_nova`, `am_echo`,
  `am_onyx`, `bm_fable`) and `am_santa` are never cast. `make_vo.py` refuses them.

### Voices NOT used

**No Piper voice is used in the preview.** Several Piper voices have non-commercial or unclear dataset
terms. They are listed in `voices.json` → `engines.not_recommended`:

- ryan: CC BY-NC-SA;
- lessac: research-only corpus;
- kathleen and southern_english_female: fine-tuned from Ryan;
- amy and danny: no license found;
- alan: All Rights Reserved.

The license-clean Piper fallback (en-us-libritts-high, CC BY 4.0, needs attribution) is not needed
either.

## Tools used to make the takes

These are programs and libraries. Their licenses cover the software, not the audio made with it.

| Tool | Version | License | Role |
|---|---|---|---|
| kokoro-onnx | 0.6.1 | MIT | Runs the Kokoro model |
| onnxruntime | 1.30.0 | MIT | Neural-network runtime |
| espeak-ng (system package) | 1.51 | GPL-3.0-or-later | Text → phonemes for Kokoro (used as a tool) |
| phonemizer | 3.4.0 | GPL-3.0-or-later | Python bridge to espeak-ng |
| espeakng-loader | 0.2.4 | MIT | Kokoro dependency (its bundled espeak is not used; the system one is) |
| SoX | 14.4.2 | GPL-2.0+ / LGPL-2.1+ | Resampling (rate -v) and pitch shifting |
| NumPy | 2.4.6 | BSD-3-Clause (+ bundled permissive parts) | Signal processing |
| SciPy | 1.17.1 | BSD-3-Clause | Filters, STFT, LPC |
| soundfile / libsndfile | 0.14.0 / 1.2.2 | BSD-3-Clause / LGPL-2.1+ | WAV reading and writing |

## Tools used only to check the takes (nothing from them is in the audio)

| Tool | Version | License | Role |
|---|---|---|---|
| pocketsphinx (with its bundled en-us model and CMU dictionary) | 5.1.1 | BSD-2-Clause | Offline speech recognition: intelligibility check and word timings (`vo/words.json`) |

## Credits

- Not required by the Apache-2.0 license for the generated audio.
- Suggested credit line for the preview description: "Temporary voices: Kokoro-82M (Apache-2.0)."
- The screenplay asks to credit only real contributors. No computer voice is credited as a person.

## Soundtrack (music, sound effects, mix) and subtitles

Built by `tools/build_soundtrack.py` (cue sheet with every placed sound: `mix/soundtrack.json`).
Nothing in the soundtrack is downloaded audio. The CC0 sites in `../audio-plan.md` (Freesound,
OpenGameArt, Kenney, archive.org) were tried from this machine on 2026-10-07 and could not be
reached, so every sound is made in code.

| What | Source | License |
|---|---|---|
| All sound effects and ambience: sea, gull, ship, egg and shell stages, hatchling breaths, chamber room tone and lamp, footsteps and cloth, riding-ground birds and wind, leather and buckles, the three wingbeats, Charcoal's breath, the launch (turf, stones, dust), the altitude wind, the jaws beat, the scout's pass, the banking beat | Procedural synthesis in `tools/sfx_lib.py` (noise, oscillators, modal resonators, filters, synthetic reverb; fixed seeds). Original work of this project. | No third-party material, so nothing to license or credit |
| Abby's held breath (1A-25) and ragged breath (1E-07) | `make_vo.py` breath generator (procedural) | as above |
| Abby's startled cry (1E-04) | Kokoro `af_heart` (Abby's own preview voice) saying "Ah!", through the same pain processing as her pain lines | Apache-2.0 (as the takes above) |
| Music: M1, M2a, M2b, M2c, M3 | Original score written in `tools/score.py` (notes, harmony, orchestration: this project) | Original work of this project |
| Instrument sounds used to play the score | **FluidR3_GM.sf2** SoundFont, Debian package fluid-soundfont-gm 3.1 (sha256 `74594e8f…0cb0`, checked by `score.py`) | **MIT**, Copyright 2000-2002, 2008 Frank Wen (built partly from public-domain samples) |

The MIT license allows any use, including commercial use. Its notice ("The above copyright notice
and this permission notice shall be included in all copies or substantial portions of the
Software") covers copies of the SoundFont itself, which is never distributed here. Crediting it
is still the honest thing to do; see the suggested credit line below.

### Tools used to make and check the soundtrack (software licenses; nothing from them is in the audio)

| Tool | Version | License | Role |
|---|---|---|---|
| NumPy / SciPy / soundfile | 2.4.6 / 1.17.1 / 0.14.0 | BSD-3-Clause | Synthesis, filters, convolution reverb, compressor, true-peak limiter, WAV I/O |
| FluidSynth | 2.3.4 | LGPL-2.1-or-later | Plays the score's MIDI through FluidR3_GM (reverb and chorus off) |
| FFmpeg (Ubuntu build, `--enable-gpl`) | 6.1.1 | GPL-2.0-or-later (this build) | `loudnorm` two-pass mastering, `ebur128` measurement, AAC test encode |
| SoX | 14.4.2 | GPL-2.0+ / LGPL-2.1+ | Resampling inside the cry's voice processing (`make_vo.py`) |
| kokoro-onnx / onnxruntime / espeak-ng | 0.6.1 / 1.30.0 / 1.51 | MIT / MIT / GPL-3.0-or-later | The cry (same engine as the takes) |

Subtitles (`preview.en.srt`) are the screenplay's own words from `../dialogue.json`.

### Suggested credit line for the soundtrack

"Temporary voices: Kokoro-82M (Apache-2.0). Music rendered with the FluidR3_GM SoundFont by Frank
Wen (MIT)." Everything else is original to the project.
