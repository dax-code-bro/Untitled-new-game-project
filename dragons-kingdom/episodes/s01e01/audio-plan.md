# Dragon's Kingdom S01E01: audio plan

**Status:** this is a plan plus a few small real tests. No episode audio exists yet and nothing has been rendered. The test clips are short experiments (each a few seconds long), not finished sound. I could not listen to them. Everything I say about how they sound comes from measuring them (pitch, loudness, frequency content, timing) and from how they were built.

The machine-readable companion file is `voices.json`, which holds the voice for every role and its settings. Everything in it is **provisional** until Daxtyn approves it.

---

## Part 1: for Daxtyn (plain language)

### The short version

- **Free computer voices work on this machine. I tested them.** Two free voice programs ran here and produced clips for Remi, Abby and every other role:
  - Kokoro (Apache-2.0 license), which came out ahead on what I could measure: wider pitch range, higher sample rate, identical output on every run. Your ears decide the rest.
  - Piper (GPL program; its LibriTTS voices are CC BY 4.0).

  They are clear, and each one gives the same voice every time.
- **What computer voices can't do well:** really whisper, cry out in pain, or shout. Some of the most important moments need exactly that:
  - Alexandria's whispered "My pretty little weapon";
  - Abby's "My arm—";
  - Remi's "Abby!".

  I made a whisper effect, and it does remove most of the "buzz" from the voice (measured). It still sounds processed.
- **My recommendation:** use computer voices first, as a temporary track to time the animatic. Then **record real people (you, family, friends) for the four big roles: Abby, Remi, Alexandria and the King of Cling.** The narrator is a great role for you to read yourself. Computer voices are fine for the small roles. Any role can switch to a real recording at any time. The build simply prefers a recording when one exists.
- **Dragons don't talk.** Their sounds (breath, growls, calls, wingbeats) are built in code. Your own growls and breaths, recorded and pitched down, can be layered in to make them unique. I built test sounds:
  - Charcoal's huge, slow wingbeats;
  - Leaf's quick little flaps;
  - the scout's whip-crack pass;
  - high-altitude wind;
  - the egg scratching and cracking;
  - Charcoal's low growl;
  - the final heavy wingbeat into silence.
- **Music is also made for free,** either in code or with a free instrument sound bank. I made two 10-second test sketches of the opening idea (low strings, then a quiet rising theme). The measured notes are the ones I wrote.
- **Everything is free.** I used no paid services. Two problems came up:
  - Some free voice models are **non-commercial only**, and one is "All Rights Reserved". This plan avoids all of them, so the episode can be posted publicly, even monetized.
  - Sound libraries (Freesound etc.) are blocked from this machine. If you download sounds yourself, check every single file's license.
- **The finished sound:** stereo, 48 kHz, inside the MP4. Loudness is set for YouTube-style listening; this was tested end to end on a 12-second mock scene. Subtitles come straight from the screenplay's spoken lines: a `.srt` file plus a subtitle track you can turn on and off.

### Questions only you can answer

1. **How do you say these words?** "Bashion" (computer default: *BASH-un*; or *BASH-ee-on*?), "Verdor" (*VER-dor*?), "Tara" (*TAR-uh* or *TAIR-uh*?). Abby's line "Why couldn't I get a Bashion?" is one of your original lines, so it should sound the way you say it.
2. **Will you record voices?** Which roles, and who? (Suggested: Abby, Remi, Alexandria, King of Cling, maybe the Narrator.)
3. **Narrator:** a woman's voice is proposed only so it can't be confused with any character. Would you rather have a man's voice, or your own?
4. **Unnamed roles:** the screenplay doesn't say whether the Attendant, Ground Keeper, Healer, Royal Messenger, Parent and Adult Villager are men or women. I picked some provisionally (see the table). The Child is left unspecified. Change anything you like.
5. **Accents:** Remi, Abby and Alexandria share one (American-English) voice family. The King of Cling, his Guard Captain and the Musician sound British. Queen Fall has a different British voice, so she can never be mistaken for Alexandria. Is that OK?
6. **Will you post it publicly or monetize it?** This plan already assumes yes and only uses voices that allow it.
7. **Dragon voices:** do you want to record your own growls, hisses and breaths for Charcoal, Leaf, Starlight and the scout?
8. **Music:** code-made synth strings, the free instrument sound bank, or real instruments played by people you know?
9. **Subtitles:** a switchable subtitle track plus `.srt` (proposed), or burned into the picture? Burning them in costs a whole extra 4K encode.

### How to record voices at home (free)

- **What to use:** a phone voice-memo app or any USB microphone with **Audacity** (free, GPL). Save as WAV if you can; phone files (m4a) also work.
- **Where:** a small room with soft things in it. A closet full of clothes, or sitting on a bed with blankets around, is ideal. Turn off fans, TV and music. Close the window.
- **Microphone position:** about a hand-span away (15–20 cm), a little to the side of your mouth so "p" and "b" don't pop. **Use the same spot and distance every session.** That's what keeps a character sounding like the same person.
- **Levels:** normal speech should peak around the middle of the meter, and the loudest shout should never hit the top or turn red. For shouts, lean back to about arm's length instead of turning the level down.
- **Acting:**
  - Record 2–3 takes of each line, with a second of silence before each.
  - Whispers go close and slightly off to the side.
  - For pain, breathe and act it. Abby's pain "narrows her voice without eliminating her personality".
  - Flying scenes are recorded indoors with no wind. The wind is added later, so don't add effects yourself.
- **Words:** say the words exactly as written, especially the four original lines (Alexandria's whisper, Remi's two flight lines, Abby's "Why couldn't I get a Bashion?"). If a friend changes a word in another line, tell me so the subtitles can be updated.
- **File names:** `abby_L072_take2.wav` (role, line number from `dialogue.md`/`dialogue.json`, take).
- **Permission:** ask everyone if their voice can be used in the posted episode, and get a parent's OK for anyone under 18. Put real names in the end credits only if they want. The screenplay says to credit only real contributors.

### Fun free foley you can record yourself

Foley means real objects recorded and then mixed in:

| Sound | What to record |
|---|---|
| Big wingbeats | A bedsheet shaken hard, or an umbrella snapped open |
| Saddle and harness | A leather belt or jacket creaking |
| Rubble and footsteps | Gravel or cat litter in a tray |
| Breaking timber | Dry sticks snapped |
| Fire crackle | Crumpled cellophane |
| Splashes | A bucket or bathtub |
| Market coins | Coins in your hand |

For breaking tiles, an adult can help you break old clay pot pieces inside a box, wearing gloves and eye protection. Keep it safe.

---

## Part 2: technical plan (for the build)

### 1. Free offline TTS: what was actually tested

All of this ran on the 4-core CPU-only machine while a render benchmark was running (load average 3–15). TTS was limited to 1–2 threads at low priority.

| Check | Result |
|---|---|
| `pip install piper-tts` (+ numpy, scipy) | **Worked**: piper-tts 1.8.0 in ~15 s from PyPI |
| Piper voices from Hugging Face (`rhasspy/piper-voices`) | **Blocked** by this environment's egress policy (HTTP 403). Not retried. |
| Piper voices from GitHub (`rhasspy/piper` release v0.0.2) | **Worked**: 9 English voices; 9 voices + Kokoro files in 24 s total |
| Kokoro-82M (`pip install kokoro-onnx`, model from GitHub `thewh1teagle/kokoro-onnx` model-files-v1.0) | **Worked** after pointing it at the system espeak-ng (the pip `espeakng-loader` data path fails with phonemizer 3.4.0; fix: `PHONEMIZER_ESPEAK_LIBRARY=/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1` plus `EspeakConfig(lib_path=…, data_path=/usr/lib/x86_64-linux-gnu/espeak-ng-data)`) |
| espeak-ng 1.51 + SoX 14.4.2 via apt (archive.ubuntu.com) | **Worked** |
| CC0/free sound sites (Freesound, OpenGameArt, Kenney, Musopen, Sonniss, Incompetech) | **Unreachable** from this machine (proxy refuses the connection) |
| FluidSynth 2.3.4 + FluidR3_GM soundfont via apt | **Worked** (with `--no-install-recommends`; the default install hit a stale-index 404) |

**Speed and behaviour (measured):**

| Engine / voice | Generation speed | Output | Repeatable? | Notes |
|---|---|---|---|---|
| **Kokoro-82M int8** (28 English voices) | 1.6–2.1× the line length at 2 threads; ~2.8× at 1 thread under heavy load; loads in 0.7 s | 24 kHz | **Yes**, bit-identical | Best measured quality (more natural pitch movement than espeak); chosen as primary |
| **Piper en-us-libritts-high** (904 speakers) | 0.29–0.35× (≈3× faster than real time) at 2 threads; loads in ~1 s | 22.05 kHz | **No**: each run differs (Remi L046 took 5.07 s, then 5.67 s) | Fallback; keep approved takes as files |
| Piper "low" voices (amy, kathleen, …) | ~0.04× (very fast) | 16 kHz (telephone-like) | No | License problems (see below) |
| espeak-ng | effectively instant | 22.05 kHz | Yes | Robotic, ~5 semitones of pitch movement; placeholder only |

**Speaking rate matters for timing.** At default speed every engine spoke **30–45% faster** than the timing model in `dialogue.json`:

- Remi's original L046 (19 words, estimate 7.8 s): Kokoro 5.4 s, Piper LibriTTS 4.5–5.7 s.
- Abby's L048 (estimate 2.3 s): about 1.3–1.45 s.

With the proposed role speeds and sentence gaps, Remi's L046 became 5.8 s and Narrator L001 4.8 s (estimate 5.7 s). **Time the animatic from the actual takes, not the estimates.**

**Whole-episode cost:** 198 lines, about 5–7 minutes of speech. Kokoro needs roughly 10–20 CPU-minutes; Piper about 2–3. This is negligible next to the video, which needs about 57–65 render-minutes per finished minute at native 4K (measured by the render pipeline's benchmark: 0.37–0.42 frames per second), so about a day of rendering for one native 4K pass of the ~25-minute episode.

**Audition reel (real, provisional):**

- A script that reads only `voices.json` + `dialogue.json` rendered one line for each of the 18 roles: 55.8 s of audio in 108.7 s on one low-priority thread.
- It also rendered a whisper version of Alexandria's L011 and a pain + cut-off version of Abby's L072.
- Measured pitch on those lines: Remi 115 Hz, Abby 210 Hz, Alexandria 197 Hz, King of Cling 161 Hz, Child 264 Hz (after the +4 semitone shift), Guard 108 Hz vs Vendor 123 Hz in the same scene.
- Queen Fall measured 207 Hz unshifted, above Alexandria, so `voices.json` lowers her 2 semitones.

### 2. Licenses: voices, data and tools

**Voice models.** This is the part that can bite:

| Voice | Data / license | Verdict |
|---|---|---|
| **Kokoro-82M v1.0** (all voices) | Weights **Apache-2.0**; kokoro-onnx MIT | **Use** (primary). Its model card describes the training audio as permissive and public-domain recordings plus synthetic audio from closed commercial TTS. The card is on Hugging Face, so I could not re-check it here. To be careful, voices named after a commercial product's voices (alloy, nova, echo, onyx, fable) and `am_santa` are not cast. |
| **Piper en-us-libritts-high** | LibriTTS (OpenSLR 60), **CC BY 4.0**, trained from scratch | **Use** (fallback). Credit line: "Some voices synthesized with Piper using a model trained on LibriTTS (CC BY 4.0)." |
| Piper ryan-medium / ryan-high | RyanSpeech **CC BY-NC-SA 4.0** | **Non-commercial only**. Not used. |
| Piper lessac-medium | Blizzard 2013 Lessac corpus, own CSTR licence (page blocked here; research-use corpus) | Treat as **non-commercial**. Not used. |
| Piper kathleen-low | Data CC0, **but fine-tuned from Ryan** (NC-SA data) | Treat as **non-commercial**. Not used. |
| Piper southern_english_female-low | OpenSLR 83 CC BY-SA 4.0, **fine-tuned from Ryan** | Treat as **non-commercial**. Not used. |
| Piper amy-low, danny-low | "License: see URL" (Mycroft mimic3-voices); no per-voice licence found; fine-tuned from Ryan | **Unclear**. Not used. |
| Piper en-gb-alan-low | Source voice LICENSE: "Copyright 2022 Mycroft AI, **All Rights Reserved**" | **Do not use** |

**Tools.** A program's license covers the program, not the audio you make with it:

| Tool | License |
|---|---|
| piper-tts 1.8.0 | GPL-3.0-or-later |
| espeak-ng 1.51 | GPL-3.0 |
| phonemizer 3.4.0 | GPL-3.0 |
| kokoro-onnx | MIT |
| onnxruntime | MIT |
| numpy, scipy, soundfile | BSD-3-Clause |
| SoX | GPL-2.0+ (libsox LGPL) |
| ffmpeg | LGPL/GPL (Ubuntu build with x264 is GPL) |
| FluidSynth | LGPL-2.1+ |
| **FluidR3_GM soundfont** | **MIT** (verified in `/usr/share/doc/fluid-soundfont-gm/copyright`) |
| Audacity (for recording) | GPL-2.0-or-later |

### 3. Voice casting (provisional, all values in `voices.json`)

Kokoro is the primary engine; the fallback is a Piper LibriTTS speaker id. Fallback speakers were chosen by measured pitch only and **were not listened to**. "f0" is the voice's measured median pitch on a test sentence at speed 1.0. Pitch shifts are done afterwards with SoX.

| Role | Lines | Kokoro voice | Speed | Pitch shift | f0 | Fallback (LibriTTS id) | Record for real? |
|---|---|---|---|---|---|---|---|
| NARRATOR | 5 | bf_emma (en-gb) | 0.85 | 0 | 185 Hz | 780 | priority 2 (Daxtyn?) |
| ATTENDANT | 4 | af_river | 0.95 | 0 | 187 | 384 | 4 |
| ALEXANDRIA | 31 | af_kore | 0.90 | 0 | 161 | 120 | **1** |
| ABBY | 46 | af_heart | 1.00 | 0 | 212 | 180 | **1** |
| REMI | 56 | am_michael | 0.95 | 0 | 122 | 72 | **1** |
| GROUND KEEPER | 7 | am_fenrir | 0.95 | 0 | 147 | 24 | 3 |
| HEALER | 4 | af_nicole | 0.90 | 0 | 147 | 228 | 3 |
| ROYAL MESSENGER | 2 | am_eric | 1.05 | 0 | 157 | 504 | 4 |
| VENDOR | 5 | am_puck | 1.00 | 0 | 122 | 480 | 3 |
| MUSICIAN | 1 | bm_lewis (en-gb) | 1.00 | 0 | 102 | 360 | 4 |
| KING OF CLING | 17 | bm_george (en-gb) | 0.95 | 0 | 144 | 300 | **1** |
| GUARD CAPTAIN | 7 | bm_daniel (en-gb) | 1.00 | 0 | 127 | 576 | 2 |
| CHILD | 3 | af_bella | 1.00 | **+4** | 205 → ~264 | 408 (+3) | 2 (real child, with permission) |
| PARENT | 3 | af_aoede | 0.95 | 0 | 190 | 96 | 3 |
| WATCHMAN | 2 | am_adam | 1.05 | **+2** | 125 | 852 | 4 |
| QUEEN FALL | 1 | bf_lily (en-gb) | 0.85 | **−2** | 182 | 696 | 2 |
| GUARD | 3 | am_liam | 1.00 | **−2** | 124 | 744 | 4 |
| ADULT VILLAGER | 1 | af_jessica | 1.05 | 0 | 220 | 444 | 4 |

Rules:

- No two roles share a voice; the builder asserts this.
- Same-scene voices are separated by pitch or accent (e.g. 2C Messenger 157 Hz vs Remi 122 Hz).
- Alexandria and Queen Fall differ in accent and timbre.
- Genders that the screenplay does not give are provisional casting choices, marked in `voices.json` `gender_basis`.

**Honest quality ceiling of TTS for this script:**

- Conversational and expository lines: good to acceptable.
- Short commands ("Attack.", "Hold!"): acceptable.
- Raised voices and shouts: weak. They sound like loud reading.
- Pain (Abby 1E/2A), the whisper (L011) and the cut-off cries ("My arm—", "Hold—"): poor. These rely on breath and strain the models don't produce.
- The child: weak. There is no free child voice, so it is an adult voice raised 4 semitones.
- Kokoro output stops at 12 kHz and Piper's at 11 kHz, so TTS sounds slightly duller than a real microphone. This is fine for the mix.

**Text sent to TTS vs subtitles:**

- TTS input = `dialogue.json` `text` with leading or trailing em dashes removed and pronunciation respellings applied. Today the only respelling is "Slitherwing" → "Slither-wing", because espeak reads it *slither-wuh-ing*. "Bashion", "Verdor" and "Tara" wait for Daxtyn's answer.
- Subtitles always use the untouched `text`.
- The [ORIGINAL] lines L011, L046, L047 and L048 are spoken word-for-word. No marker or bracket note is ever spoken.

**Per-line handling** (`voices.json` → `special_lines`, 35 entries):

- **Masked on purpose** (L173 "Dragon." under the festival music, because the screenplay says it is "swallowed by the music"): spoken at normal volume and mostly covered by the mix. The subtitle still shows it.
- **Clear aside (L042, "You could have warned the grass."):** *not* masked. The screenplay says the joke is "for Abby and the viewer", so it is recorded or mixed close on Abby and stays easy to hear, with wind under it at the normal flight-dialogue level. Remi's not hearing it is shown by the distance and his lack of reply.

- **Whisper (L011):**
  1. Synthesize at 0.8× speed.
  2. Replace the voiced source with noise shaped by the smoothed spectral envelope (cepstral lifter ~1.5 ms).
  3. Keep 10% of the original and high-pass at 250 Hz.
  4. Mix 10–12 dB under normal dialogue, close and dry.

  Measured: harmonicity fell from 0.79 to 0.27.
- **Quiet** (L020, L062, L083, L176): slightly slower, −5 to −6 dB in the mix.
- **Through pain** (L072, L075, L086, L100): 0.9× speed, a breath before, slight high-pass.
- **Raised voice** (11 lines): 1.08× speed, presence boost and light saturation, +3–4 dB, partly covered by wind or crowd.
- **Cut-offs** (L072, L081, L130, L169, L191): synthesize without the dash, cut 60–90 ms before the natural end with a 10–15 ms fade, and start the interrupting line 0–150 ms before the cut. L171 continues L169.
- **Dragon commands:** short and firm; the dragon's reaction follows on the next beat.
- **Queen Fall's "Attack." (L180):** quiet authority, no shout.

### 4. Human recordings in the pipeline

```
episodes/s01e01/audio/vo/
  tts/<role-slug>/<line_id>.wav                 generated from voices.json (48 kHz, 24-bit, mono)
  human/<role-slug>/<line_id>_take<N>.wav       recorded by people (any format; converted)
  takes.json                                    {"L072": "human/abby/L072_take2.wav", ...}
```

The assembly step processes each line like this:

1. Take the file named in `takes.json` if the line is listed; otherwise use the TTS take.
2. Convert with `ffmpeg -i in -ac 1 -af aresample=48000:resampler=soxr -c:a pcm_s24le out.wav`.
3. Trim silence to 40 ms and add 5 ms fades.
4. Normalize to −20 dBFS speech RMS (peak ≤ −3 dBFS).
5. Place the line at its frame on the episode timeline. Performance level is set in the mix, not in the file.

Human takes replace TTS **line by line**, so mixing the two during production is fine. For the finished episode, one role should not jump between a TTS voice and a human voice; that would break "one consistent voice per role". Approved takes are files: they are archived and never regenerated.

**Lip sync:** the shot list has 97 LIPSYNC shots. This Kokoro export gives no phoneme timings (its only output is `audio`). Mouth cues should therefore come from the final WAVs, whether TTS or human, for example with **Rhubarb Lip Sync** (MIT; offline; untested here).

### 5. Sound effects: how to make them for free

**A. Procedural synthesis in code (recommended backbone).** Use numpy/scipy, or SoX, which is now installed. The result is 100% original, so there is nothing to license and nothing to check. Everything is repeatable from fixed seeds and adjustable per shot (length, tempo, pan). Synthesis cost is tiny: all 9 prototypes took 11.7 s of CPU.

The weak spots are organic and human sounds: crowd walla, screams, a real seagull, timber splinter detail. Use foley or careful CC0 for those.

**B. Foley recorded by Daxtyn and friends.** Original and free; see Part 1.

**C. CC0 libraries (check every file).**

CC0 sources:

- **Freesound.org** (filter "Creative Commons 0"; the site mixes CC0, CC-BY and CC-BY-NC; free account).
- **OpenGameArt.org** (filter CC0; mixed licenses).
- **Kenney.nl** audio packs (CC0; mostly game and UI sounds).
- **Musopen** public-domain music recordings.

Free but *not* CC0 (allowed with conditions):

- **Incompetech** music: CC BY 4.0, credit required.
- **Sonniss GDC bundles**: royalty-free custom license.
- **Pixabay**: Pixabay Content License.

Not suitable:

- **BBC Sound Effects** (RemArc license: personal, educational or research use only).
- **Free Music Archive** tracks marked NC.
- **YouTube Audio Library** (YouTube-only terms).

All of these sites are **unreachable from this machine**, so downloads would happen on Daxtyn's computer. Keep a license log for every file: file name, URL, author, license, date. A single CC-BY-NC file makes the episode non-commercial.

**Prototypes made for real** (48 kHz stereo, 24-bit, original synthesis; in the session scratchpad `preprod/audio/sfx/`, not in the project). I could not listen to them; these descriptions come from measurements:

| File | How it's built | What the measurements say it sounds like |
|---|---|---|
| `charcoal_wingbeats_immense.wav` (11.9 s, 3 beats) | Per beat: a 34 Hz pressure push with harmonics; a displaced-air whoosh sweeping 180→700→180 Hz; a sail-like membrane snap at the bottom of the stroke; trailing-edge flutter; a soft upstroke | A deep "whoomp … fwump" every **2.8 s** (prototype tempo only: the final tempo must match the animation, see the note under this table). Downstroke **19–22 dB louder** than the upstroke, so it reads as single immense beats. Energy: 29% below 60 Hz, 47% at 60–250 Hz, 28% above 150 Hz, so it is still audible on phone speakers (first version was 68% sub-bass; fixed). Power-weighted centroid ~240 Hz. |
| `leaf_wingbeats_quick_corrective.wav` (6 s, 13 beats) | Short pink-noise whooshes centred 600→1500 Hz, a light thump and small snap, two "corrections" (double beats) | Quick, light flapping: mean interval **0.37 s** (two 0.2 s corrections; others ~0.4 s; prototype tempo only, see the note under this table). Centroid ~1.4 kHz, mostly 1–4 kHz: clearly smaller and higher than Charcoal. Localises as one creature (inter-channel correlation 0.71 within ±2 ms). |
| `scout_pass_sharp_crack.wav` (4.2 s) | Doppler-shifted rush (85 m/s, 3 m miss distance), N-wave pressure crack at closest approach, turbulent wake | Enters **hard right** (+25 dB R/L), rises 35 dB in 1.2 s, **cracks at 1.20 s**, pitch falls from ~2.3–2.7 kHz to a low wake rumble. Pans right → left to match the shot list: the scout enters frame right and passes through the gap between Leaf and Charcoal, on Leaf's left (sea) side, the **far** side from the camera (`shotlist.json` → `conventions.the_pass_1E`). So keep it slightly less close and direct than a pass on the camera side. The wake then surrounds rather than staying hard left. |
| `wind_bed_high_altitude_loop.wav` (20 s, loopable) | Low-passed pink noise with slow gusts, brighter hiss on gusts, two drifting low "moan" resonances; uncorrelated L/R | A dark, wide wind (56% of energy under 250 Hz) with gusts swinging ~8.5 dB. **Loop seam is click-free**: the end-to-start jump is 0.006 vs a typical sample step of 0.010. (The first version clicked because I filtered after looping; fixed.) |
| `egg_scratch_then_crack.wav` (6.1 s) | Stick-slip scratches exciting shell resonances (2.1–9.8 kHz), then a fine crack (9 clicks), a pause, a bigger break (22 clicks), fragments, a tiny breath; small warm room | Bright and small (centroid ~4.9 kHz). Transients land exactly in the scripted stages: scratches 0.3–1.9 s, first crack 2.45 s, break 3.65–4.3 s, breath ~4.8 s. This matches the screenplay's "different meaningful stages, don't repeat the same cracking shot". |
| `charcoal_breath_low_growl.wav` (7.2 s) | Rising inhale, then a jittery glottal pulse train at ~31 Hz through big low formants (170/410/930/2100 Hz) plus breath noise | A slow inhale then a very low, rough growl. Measured fundamental **30 Hz**; 82% of energy at 60–250 Hz. No roar (Charcoal never roars at the nip). |
| `final_heavy_wingbeat_into_silence.wav` (7 s) | One Charcoal-style beat with a 4 s dark tail | One beat that rings out and fades to **true silence**: the last second is −123 dBFS. This matches "One final heavy wingbeat carries into darkness. Silence follows." |

**Wingbeat tempo must match the picture.** The animation takes each dragon's wingbeat speed from one setting in `assets.json` (`scale.readings` → `wingbeat_hz_*`, for the size reading Daxtyn picks). The sound uses the same numbers; `voices.json` → `creature_vocals` → `wingbeat` lists them. At the recommended reading that is one beat every **~1.3 s for Charcoal, ~1.6 s for Starlight and ~0.6 s for Leaf** (bulk reading: 1.0 / 1.15 / 0.6 s; length reading: 2.8 / 4.0 / 0.6 s). The prototypes above were timed before that setting existed (Charcoal 2.8 s matches only the length reading). Re-time them once the size is chosen; never type a separate tempo into the sound.

**Full SFX list** (from the screenplay and the shot list's sound notes). "Proc" means procedural.

| Sound | Method | Status |
|---|---|---|
| Waves on rock, open-water wash, hull slap, rigging creak | Proc (noise with wave-cycle envelopes, foam hiss) + foley creaks | To build |
| Single seabird call (prologue) | Foley or careful CC0; a proc FM "gull" is possible but risky | To source |
| Egg scratch / crack stages, shell fragments, hatchling breaths | Proc | **Prototyped** |
| Charcoal immense, infrequent wingbeats | Proc | **Prototyped** |
| Leaf quick corrective beats; "rapid and uneven" after the pass | Proc | **Prototyped** (uneven variant to do) |
| Scout sharp pass crack + violent wake | Proc | **Prototyped** |
| Starlight beats (twice Charcoal's size: period = 1 / `assets.json` `wingbeat_hz_starlight`, about 1.6 s at the recommended reading; push ~26–30 Hz, broader; wide "comes from the buildings" in 3C) | Proc (scale the Charcoal model) | To build |
| Wind beds (altitude, field, trees, ruined square) | Proc | Altitude **prototyped** |
| Takeoff ground devastation (turf tearing, stones clattering, rolling dust) | Proc (sub thump + tearing grains + granular stone impacts + dust swell) + foley (ripped grass, gravel on a board) | To build |
| Fire breath ("Fire.", ~1.5 s, brief) | Proc (ignition whump + roaring noise + sparse crackle) | To build |
| Jaws snap, hide/equipment strain, rig creak, tearing crack (scout's left wing) | Foley (leather, rope) + proc creak/groan; no gore emphasis | To build |
| Distant water impact, churn, lap | Proc (thump + burst + granular droplets, high-cut for height) | To build |
| Harbor bell → festival bell match | Proc modal bell (hum/prime/tierce/quint/nominal partials). Harbor: lower and duller. Festival: brighter, tuned to the same pitch class so the match cut sings. | To build |
| Festival bed: chatter/walla, laughter, coins, pans, footsteps, dog, cloth, stall rattle | Walla: friends' recording (best) or a layered TTS babble (20+ voices, unintelligible, low and wide) or CC0 crowd; foley for the small sounds | To source |
| Crowd panic, screams under destruction | Friends' recording (with consent) or CC0; TTS cannot scream | To source |
| Banner snap/tear, cloth | Foley (sheet) + proc | To build |
| Timber splintering, tiles cascading, debris whistle, stall tumbling | Foley (sticks, old clay pieces, safely) + proc impacts/whistles | To build |
| Ringing ears → coughing, settling wood, distant cries, metal fitting on stone | Proc tinnitus tone (~4–6 kHz) + low-pass sweep opening the world over 4–6 s; foley for the rest | To build |
| One final heavy wingbeat, then silence | Proc | **Prototyped** |

**Creature vocals** (no speech; settings in `voices.json` → `creature_vocals`):

| Creature | Character | Sound |
|---|---|---|
| Charcoal | Immense, calm | Slow, low breath; growl f0 25–35 Hz; never a roar at the nip |
| Leaf | Quick | Chuffs and chirrs (Daxtyn's mouth sounds pitched −3 to −5 semitones, or synth at 120–300 Hz); a worried chirr in 2A |
| Starlight | Vast | Breath in the high shot; **no fire sound** (none in this episode); **no magical shimmer** (her look is reflective scales, not magic) |
| Scout | Small | Thin hiss and flutter; distress when caught; weak effort in the water |
| Hatchling | Fragile | Effortful breaths, not cute squeaks |

### 6. Music

**Cue map** (from the screenplay plus the shot list's sound notes):

| Cue | Where | What |
|---|---|---|
| M1 | Prologue, last landscape (P-15…P-17) → title | **One low sustained string tone**, then the **restrained rising theme**; gives way to the egg's scratch at the title |
| M2 | 1C (from ~1C-10/1C-15) | **Lighter flight variant** of the main theme: "private freedom, not a military procession" |
| — | 1D-19 | Music **stops** for the jaws beat (only wingbeats and air); returns softly at 1D-25 |
| — | 1E-01 | Light theme fades out; **no musical warning** before the pass |
| M3 | 1E-17 → 1F | A low drone under the pursuit; not a triumphant action cue |
| — | 2A–2C | Mostly no score (the silence after Remi's report is the point); harbor bell is diegetic |
| Source | 3A | **Festival tune** played by on-screen musicians. Original composition, built as **separate instrument stems** so the instruments can **drop out one at a time** in 3B-12. Never resumes in 3D. |
| M4 | 3C-21 | The **same rising shape** as the flight music, now with **unresolved low tones** |
| — | 3D | Ringing ears and small sounds; final wingbeat; silence |
| M5 | End titles | **Restrained main theme without cheerful resolution** |

The motif used in both sketches: a low D2 + A2 drone, then a quiet rising A3 → D4 → E4 → F4 line that stops on F (minor colour, unresolved). Variants come from register and instrumentation:

- flight: higher and lighter;
- attack: the same shape low, ending on an unresolved tone;
- end titles: full but restrained.

**How to make it, free:**

1. **Synthesized in code** (numpy). Totally original; good for drones and pads, weaker for solo melody.
2. **Code-written MIDI → FluidSynth (LGPL) + FluidR3_GM soundfont (MIT).** Tested: renders about 27× faster than real time. GM strings sound a bit dated but recognisably like strings. GM also includes fiddle, recorder, dulcimer, pan flute and drums for the festival band.
3. **Upgrade:** VSCO 2 Community Edition orchestral samples (described by its authors as CC0; verify on download; not reachable or tested here), played from MIDI by a free SFZ player.
4. **Real instruments** played by people Daxtyn knows.

Pre-made music is possible only from public-domain/CC0 sources, or CC BY with credit. The screenplay forbids inventing licensed music, so credit only what is actually used.

**Prototype sketches** (10 s each, in scratch `preprod/audio/sfx/`):

- `music_sketch_low_strings_rising_theme_10s.wav` (additive "string ensemble": detuned unison, vibrato, bow noise, synthetic hall reverb). Measured:
  - 0–3 s: D2 73.5 Hz and A2 110 Hz.
  - Violas (D3/F3) enter at 3.5 s.
  - End: F4 at 348.3 Hz (target 349.2) with A2, D3, F3 still present.
  - Brightness rises as the theme enters (power centroid 149 → 227 Hz).
  - Smooth and dense: crest factor 11.8 dB, loudness range 2.8 LU.
  - It should sound like a dark, soft synthetic string pad with a slow, restrained rise.
- `music_sketch_fluidsynth_gm_strings_10s.wav` (same notes as MIDI through FluidSynth + FluidR3_GM: contrabass, cello, string ensembles). Measured: D2 73.3, A2 109.8, D3 147.1, D4 293.3, E4 330.2 and F4 346.4 Hz (about 14 cents flat, from the soundfont's sample tuning).

### 7. Mixing

**Stems** (keep them separate, 48 kHz / 24-bit WAV):

| Stem | Contents |
|---|---|
| DX | Dialogue |
| FX | Hard effects + creature vocals |
| BG | Ambience beds |
| FOLEY | Recorded objects |
| MX | Score and source music |

Separate stems make re-mixes, and a music-and-effects version, possible later.

**Levels (starting points):**

- Dialogue lines are normalized to −20 dBFS speech RMS. Performance level comes from the mix: whisper −10 to −12 dB, quiet −5 to −6 dB, shouts +3 to +4 dB.
- Music under dialogue: about 12–18 dB below the voice, with ducking (tested: −6 dB, 150 ms attack, 400 ms release).
- Ambience: 15–20 dB below the voice, ducked −3 dB under lines.
- Big events (takeoff, the pass, the dive) may briefly exceed dialogue level and are then caught by the limiter.

**Spaces:**

| Location | Treatment |
|---|---|
| Birthing chamber | Small warm room |
| Treatment room | Small dry room |
| Harbor and field | Open air, little reverb |
| Sky | Almost no reverb; wind does the work |
| Cling square | Stone reflections |

**Flight dialogue:** wind fills the gaps between lines. It is ducked a little under speech, not removed, because the screenplay says to put wind between airborne speakers. Voices stay close and intelligible. That includes Abby's "You could have warned the grass" (L042): it is a close aside the audience hears clearly (shot 1C-09). Remi can't hear it because he is far away, which the picture shows; the mix does not hide it.

**Panning:** follow the shot list's screen-direction conventions.

- In 1C–1E Leaf is screen-left/near and Charcoal screen-right/far.
- The scout pass moves right → left, on the far side of Leaf (between Leaf and Charcoal, away from the camera).
- In 3C the dive's wing noise is spread across the whole stereo field.
- Dialogue stays near the centre (subtle offsets only in wides).

**Lip sync and dialogue timing:** place each line on an exact frame. At 48 kHz and 24 fps, **one frame = 2000 samples**.

### 8. Delivery (tested end to end on a 12-second mock)

**Master:** one stereo WAV covering the **whole episode from frame 0**: 48 kHz, 24-bit, exactly `frames × 2000` samples long.

- **Loudness target: −16 LUFS integrated, true peak ≤ −2 dBTP.** The task's −16 to −14 range is fine. −16 keeps more drama and was tested; −14 matches YouTube's normalisation level but needs more limiting.
- **Recipe (tested):**

  ```
  # 1) measure
  ffmpeg -i premaster.wav -af loudnorm=I=-16:TP=-2:LRA=11:print_format=json -f null -
  # 2) gain + oversampled limiter so loudnorm can stay LINEAR (gain = -16 - measured_I)
  ffmpeg -i premaster.wav -af "aresample=192000,volume=<gain>dB,alimiter=limit=0.70:attack=1:release=60:level=false,aresample=48000" -c:a pcm_s24le limited.wav
  # 3) measure limited.wav again, then apply with the measured values
  ffmpeg -i limited.wav -af "loudnorm=I=-16:TP=-2:LRA=11:measured_I=..:measured_TP=..:measured_LRA=..:measured_thresh=..:offset=..:linear=true" -ar 48000 -c:a pcm_s24le master_48k.wav
  ```

  - Without step 2, loudnorm switched to *dynamic* mode on the mock: it reached −16.06 LUFS but compressed, and the AAC peak crept to −1.4 dBTP.
  - With step 2: linear mode, decoded AAC **−16.0 LUFS, −2.0 dBTP**.
- **Mux with the render pipeline:**

  ```
  node render/render.mjs <scene.js> --preset final --audio episodes/s01e01/audio/master/s01e01_master_48k.wav
  ```

  - The pipeline encodes AAC 256 kbps, pads or cuts the audio to the video length, and offsets it by `--start`.
  - It does not resample, so **the file must already be 48 kHz**.
  - The test with the identical ffmpeg arguments gave AAC, 48000 Hz, 2 channels, ~256 kbps, with audio = video = file = 12.000 s.
  - If the episode is rendered as several scene files, concatenate the video parts and mux the full master once (stream copy).
- **QA before calling anything finished:**
  - master length equals video frames × 2000 samples;
  - `silencedetect` finds no unintended gaps;
  - no clipping;
  - loudness and true peak re-measured on the decoded AAC;
  - mono-compatibility check;
  - the ending's final silence is intended.

### 9. Subtitles

Subtitles are generated from `dialogue.json` plus the final timeline: the assembly step writes `line_id → start/end` seconds of each placed take.

- **Text:**
  - Exactly the line's `subtitle_cues`: max 42 characters per row, 2 rows, already split in `dialogue.json` (214 cues for 198 lines).
  - No speaker names, bracket notes or [ORIGINAL] marker.
  - Original lines stay exact.
  - Em dashes stay as written.
- **Timing:**
  - Cue in = speech start, snapped to a frame.
  - Cue out = the later of speech end + ~0.3 s and in + `subtitle_min_seconds`, but at least 2 frames before the next cue.
  - Multi-cue lines share the speech span in proportion to characters, minimum 1.0 s each.
  - Interrupted lines end where the interruption starts.
- **Delivery:**
  1. A sidecar `s01e01.en.srt` (UTF-8) for upload.
  2. A soft subtitle track added without re-encoding the 4K video. Tested:

     ```
     ffmpeg -i episode.mp4 -i s01e01.en.srt -map 0 -map 1 -c copy -c:s mov_text -metadata:s:s:0 language=eng episode_subs.mp4
     ```

  3. Burned-in subtitles are optional. They need a full extra 4K encode (or drawing them in the renderer), so only do it if a platform can't show captions.
- On-screen place captions (TARA, CLING — SCRAPPER, from `onscreen-text.json`) are part of the picture, not subtitles. Keep them out of the bottom subtitle area.

### 10. Proposed project layout (not created yet)

```
episodes/s01e01/audio/
  vo/tts/…  vo/human/…  vo/takes.json
  sfx/<cue>.wav            (from a reviewed copy of the prototype synth script)
  music/midi/*.mid  music/<cue>.wav  music/stems/festival_<instrument>.wav
  timeline/audio_cues.json (cue → start frame, stem, gain, pan)
  stems/{DX,FX,BG,FOLEY,MX}.wav
  master/s01e01_master_48k.wav
  subs/s01e01.en.srt
  LICENSES.md              (one row per external file: source, author, license)
```

### 11. Where the test material is (session scratchpad, not the project)

`/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/preprod/audio/`

| Folder | Contents |
|---|---|
| `tts/` | Engine comparisons, LibriTTS and Kokoro pitch scans |
| `audition/` | `audition_reel.wav` with all 18 roles, plus the whisper and pain demos |
| `sfx/` | Prototypes and both music sketches, plus `analysis.json` |
| `mockmix/` | Stems, master, test MP4 with soft subtitles, `result.json` |

Scripts: `tts_test.py`, `kokoro_test.py`, `kokoro_scan.py`, `audition.py`, `sfx_synth.py`, `sfx_analyze.py`, `midi_sketch.py`, `mockmix.py`, `build_voices_json.py`.

The scratchpad may be deleted with the session. If the prototypes are kept, copy the scripts into `episodes/s01e01/tools/` after review.
