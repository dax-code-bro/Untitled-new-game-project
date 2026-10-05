"""Builds episodes/s01e01/voices.json from authored casting + measured test data.

Per-role line/word/second counts and scenes are read from dialogue.json so they
cannot drift; measured pitch comes from the Kokoro / Piper scans run in this
scratch folder.
"""
import json
from collections import OrderedDict
from pathlib import Path

EP = Path("/home/user/Untitled-new-game-project/dragons-kingdom/episodes/s01e01")
HERE = Path("/tmp/claude-0/-home-user-Untitled-new-game-project/c24e42f5-3f85-5974-a286-53c4d569fb35/scratchpad/preprod/audio")
D = json.loads((EP / "dialogue.json").read_text())
KSCAN = {r["voice"]: r for r in json.loads((HERE / "tts" / "kokoro_scan.json").read_text())}
LSCAN = {r["speaker_id"]: r for r in json.loads((HERE / "tts" / "libritts_scan.json").read_text())}
TTSR = json.loads((HERE / "tts" / "results.json").read_text())
KR = json.loads((HERE / "tts" / "results_kokoro.json").read_text())

stats = OrderedDict()
for l in D["lines"]:
    s = stats.setdefault(l["speaker"], {"lines": 0, "words": 0, "est_seconds": 0.0, "scenes": [], "line_ids": []})
    s["lines"] += 1
    s["words"] += l["words"]
    s["est_seconds"] = round(s["est_seconds"] + l["est_seconds"], 1)
    if l["scene"] not in s["scenes"]:
        s["scenes"].append(l["scene"])
    s["line_ids"].append(l["id"])

# ------------------------------------------------------------------ casting (authored, provisional)
# k(voice, speed, lang, pitch) = Kokoro primary. p(id, length_scale) = Piper LibriTTS fallback.
def k(voice, speed, lang="en-us", pitch=0.0):
    return {"engine": "kokoro", "voice": voice, "speed": speed, "lang": lang, "pitch_semitones": pitch,
            "measured_f0_median_hz_at_speed_1": KSCAN[voice]["f0_med"],
            "measured_pitch_span_semitones": KSCAN[voice]["f0_span_st"]}


def p(sid, ls=1.2):
    return {"engine": "piper_libritts", "speaker_id": sid, "length_scale": ls, "noise_scale": 0.6, "noise_w": 0.7,
            "measured_f0_median_hz": round(LSCAN[sid]["f0_median_hz"], 1),
            "note": "Chosen only by measured pitch from a 76-speaker sample; not listened to. Audition before use."}


ROLES = OrderedDict([
    ("NARRATOR", dict(
        gender_basis="Not specified by the screenplay. Cast female here so the prologue voice is not confused with any male character; Daxtyn may prefer a male narrator or to narrate himself.",
        direction="Clear, restrained, sparse (screenplay voice policy). Slow, with long pauses between sentences.",
        primary=k("bf_emma", 0.85, "en-gb"), fallback=p(780, 1.3),
        sentence_gap_s=0.6, audition_line="L001", human_recording_priority=2,
        why="bf_emma had the narrowest pitch movement of the British voices measured (6.2 semitones), which suits 'restrained'. Not used for any other role.")),
    ("ATTENDANT", dict(
        gender_basis="Not specified by the screenplay (no pronoun). Cast female, provisional.",
        direction="Quiet, careful, practical; a servant speaking in the queen's presence.",
        primary=k("af_river", 0.95), fallback=p(384), audition_line="L006", human_recording_priority=4)),
    ("ALEXANDRIA", dict(
        gender_basis="Screenplay: Queen Alexandria, mother of Remi and Abby.",
        direction="Controlled, economical; more intimate with her children than with servants. Her [ORIGINAL] line L011 is WHISPERED (see special_lines).",
        primary=k("af_kore", 0.9), fallback=p(120), audition_line="L007", human_recording_priority=1,
        why="Lowest-pitched of the higher-quality American female voices measured (161 Hz): reads older than Abby's voice. Must never be mistaken for Queen Fall, so Queen Fall uses a British voice.")),
    ("ABBY", dict(
        gender_basis="Screenplay: Queen Alexandria's daughter, Remi's younger sister (addressed \"Your Highness\"). Age not established (do not invent it).",
        direction="Direct, quick, unafraid to question her brother; pain narrows her voice without eliminating her personality (1E onward).",
        primary=k("af_heart", 1.0), fallback=p(180, 1.15), audition_line="L048", human_recording_priority=1,
        why="af_heart is the top-rated voice in the Kokoro project's voice list (not re-checked here) and Abby has the most emotionally varied lines. TTS cannot perform her pain convincingly: record Abby with a real person if at all possible.")),
    ("REMI", dict(
        gender_basis="Screenplay: Prince Remi IV, Abby's older brother.",
        direction="Conversational and dry with Abby; clipped when afraid (1E/1F). Commands are short and firm; 'That's enough' and 'Back' are quiet.",
        primary=k("am_michael", 0.95), fallback=p(72), audition_line="L046", human_recording_priority=1,
        why="Most lines in the episode (56). am_michael measured 122 Hz with moderate pitch movement; tested on Remi's [ORIGINAL] line L046.")),
    ("GROUND KEEPER", dict(
        gender_basis="Not specified (no pronoun). Cast male, provisional. One voice covers every GROUND KEEPER cue in 1B and 2A.",
        direction="Practical, calm; raised voice across the field ('The field's clear.', 'Clear the approach!').",
        primary=k("am_fenrir", 0.95), fallback=p(24), audition_line="L037", human_recording_priority=3)),
    ("HEALER", dict(
        gender_basis="Not specified (no pronoun). Cast female, provisional.",
        direction="Calm, professional, firm with Remi ('Give her room.').",
        primary=k("af_nicole", 0.9), fallback=p(228), audition_line="L099", human_recording_priority=3,
        why="af_nicole is a soft, close-sounding voice (narrow 5.3-semitone pitch span). Same scene as Alexandria (af_kore) and Abby (af_heart): distinct timbres, but af_nicole's pitch (147 Hz) is near Alexandria's - if they sound alike, swap to af_sarah.",
        alternates=["af_sarah"])),
    ("ROYAL MESSENGER", dict(
        gender_basis="Not specified (no pronoun). Cast male, provisional.",
        direction="Prompt, brief.",
        primary=k("am_eric", 1.05), fallback=p(504), audition_line="L138", human_recording_priority=4,
        why="Measured 157 Hz: clearly higher than Remi (122 Hz), who speaks to him in 2C.")),
    ("VENDOR", dict(
        gender_basis="Screenplay pronoun: 'he'.",
        direction="Friendly grumbling; a heckle ('You are!'); urgent in the attack ('Leave it! Come on!').",
        primary=k("am_puck", 1.0), fallback=p(480), audition_line="L156", human_recording_priority=3)),
    ("MUSICIAN", dict(
        gender_basis="Screenplay pronoun: 'he' (the vendor 'takes his arm').",
        direction="Teasing, one line.",
        primary=k("bm_lewis", 1.0, "en-gb"), fallback=p(360), audition_line="L157", human_recording_priority=4)),
    ("KING OF CLING", dict(
        gender_basis="Screenplay: the King of Cling (personal name not supplied - never invent one).",
        direction="Approachable and light at the festival; practical under pressure; quiet on 'Starlight.' (L176). Has the episode's longest speech (L171).",
        primary=k("bm_george", 0.95, "en-gb"), fallback=p(300), audition_line="L159", human_recording_priority=1,
        why="Widest natural pitch movement of the British male voices (12.8 semitones): sounds less formal, fits 'approachable'.")),
    ("GUARD CAPTAIN", dict(
        gender_basis="Screenplay pronoun: 'he'.",
        direction="Watchful; then shouted crowd orders (L179, L181).",
        primary=k("bm_daniel", 1.0, "en-gb"), fallback=p(576), audition_line="L179", human_recording_priority=2)),
    ("CHILD", dict(
        gender_basis="Not specified (screenplay uses 'their'). Do not invent a gender or age.",
        direction="Excited, curious ('Are there going to be dragons?'); frightened in the attack ('I can't see.').",
        primary=k("af_bella", 1.0, "en-us", 4.0), fallback=dict(p(408), pitch_semitones=3.0),
        audition_line="L164", human_recording_priority=2,
        why="No free child voice exists in Kokoro or Piper. An adult voice is raised 4 semitones (SoX 'pitch 400', which also raises formants - closer to a child's shorter vocal tract than a formant-preserving shift). This will sound synthetic. Best: a real child, recorded with a parent's permission.")),
    ("PARENT", dict(
        gender_basis="Not specified (no pronoun). Cast female, provisional.",
        direction="Polite hush to the child; then urgent, protective ('Stay with me. Don't stop.').",
        primary=k("af_aoede", 0.95), fallback=p(96), audition_line="L165", human_recording_priority=3)),
    ("WATCHMAN", dict(
        gender_basis="Screenplay pronoun: 'him'.",
        direction="'Dragon.' at normal volume (swallowed by the music), then raised: 'Dragon approaching!'",
        primary=k("am_adam", 1.05, "en-us", 2.0), fallback=p(852), audition_line="L174", human_recording_priority=4,
        why="+2 semitones separates him from the Vendor (am_puck) and Guard (am_liam), which measured within 3 Hz of am_adam.")),
    ("QUEEN FALL", dict(
        gender_basis="Screenplay: Queen Fall of Tara, Starlight's rider. A different person from Queen Alexandria - the voices must never be confusable.",
        direction="Low-key authority; the threat does not require shouting. One word: 'Attack.'",
        primary=k("bf_lily", 0.85, "en-gb", -2.0), fallback=p(696, 1.35), audition_line="L180", human_recording_priority=2,
        why="British accent and a different timbre from Alexandria's American af_kore. Slow speed for quiet command. Lowered 2 semitones because the unshifted audition of 'Attack.' measured 207 Hz - higher than Alexandria's 197 Hz - which works against 'low-key authority'.")),
    ("GUARD", dict(
        gender_basis="Screenplay pronoun: 'he' ('He'll look').",
        direction="Urgent ('She's turning.'), then a simple promise ('I'll look.').",
        primary=k("am_liam", 1.0, "en-us", -2.0), fallback=p(744), audition_line="L187", human_recording_priority=4,
        why="-2 semitones separates him from the Vendor (am_puck), who is in the same attack scene.")),
    ("ADULT VILLAGER", dict(
        gender_basis="Not specified (no pronoun). Cast female, provisional. No permanent named casualty.",
        direction="Injured, conscious, frightened; cut off by the king ('My family-').",
        primary=k("af_jessica", 1.05), fallback=p(444), audition_line="L191", human_recording_priority=4)),
])

assert list(ROLES) == list(stats), (list(ROLES), list(stats))
for name, r in ROLES.items():
    r.update({"display_name": name.title().replace("Of Cling", "of Cling"), **{k_: stats[name][k_] for k_ in ("lines", "words", "est_seconds", "scenes")},
              "provisional": True})

AUD = {r["role"]: r for r in json.loads((HERE / "audition" / "audition_report.json").read_text())["report"] if "role" in r}
for name, r in ROLES.items():
    a = AUD.get(name)
    if a:
        r["audition_measured"] = {"line": a["line"], "settings_used": {"voice": a["voice"], "speed": a["speed"], "pitch_semitones": a["pitch_st"]},
                                  "take_seconds": a["dur_s"], "dialogue_json_est_seconds": a["est_s"], "f0_median_hz": a["f0_med_hz"],
                                  "generation_seconds_1_thread_busy_machine": a["gen_s"]}
roles_out = OrderedDict()
for name, r in ROLES.items():
    roles_out[name] = OrderedDict([(k_, r[k_]) for k_ in (
        "display_name", "provisional", "lines", "words", "est_seconds", "scenes", "gender_basis", "direction",
        "primary", "fallback", "audition_line", "human_recording_priority") if k_ in r])
    for opt in ("sentence_gap_s", "why", "alternates", "audition_measured"):
        if opt in r:
            roles_out[name][opt] = r[opt]

# uniqueness check: no two roles share the same primary voice + pitch
seen = {}
for name, r in roles_out.items():
    key = (r["primary"]["voice"], r["primary"]["pitch_semitones"])
    assert key not in seen, (name, seen.get(key))
    seen[key] = name

# ------------------------------------------------------------------ special lines (per-line overrides)
WHISPER = {"type": "whisper", "how": "Synthesize with the role's own voice at speed 0.8, then whisper DSP: replace the voiced source with noise shaped by the speech's smoothed spectral envelope (cepstral lifter ~1.5 ms), keep ~10% of the voiced signal for intelligibility, high-pass 250 Hz. Mix 10-12 dB below normal dialogue, close and dry (no room reverb).",
           "honesty": "TTS cannot really whisper. This DSP imitation keeps the voice's identity but will sound processed. Strongly recommended: record this line with a real person."}
QUIET = {"type": "quiet", "how": "speed x0.92 of the role speed; mix 5-6 dB below normal dialogue; less reverb."}
PAIN = {"type": "through_pain", "how": "speed x0.9; prepend a short inhale/breath (recorded or synthetic); 1-2 dB quieter; slight high-pass (narrower voice). Keep personality (screenplay).",
        "honesty": "TTS cannot cry out or sound hurt. These lines lose most of their emotion with TTS - Abby's 1E/2A lines are the strongest case for a human recording."}
SHOUT = {"type": "raised_voice", "how": "speed x1.08; +3 dB presence boost around 2-4 kHz; gentle saturation; +3 to +4 dB in the mix; let wind/crowd partly cover it.",
         "honesty": "TTS 'shouts' sound like loud reading, not a raised voice. Acceptable for crowd orders; weak for 'Abby!'."}
CUTOFF = {"type": "cut_off", "how": "Synthesize the words without the dash; cut 60-90 ms before the natural end of the last word with a 10-15 ms fade-out; start the interrupting line 0-150 ms before the cut."}
CMD = {"type": "dragon_command", "how": "Short, firm, no exclamation unless written. The subtitle shows the word exactly; the dragon's reaction (sound) follows on the next beat."}

# ------------------------------------------------------------------ wingbeat tempo = the animation's tempo
# The animation drives wingbeats from assets.json scale.readings[*].wingbeat_hz_* (one config value for the
# size reading Daxtyn picks). The sound must use the SAME values, never a separately typed tempo.
ASSETS = json.loads((EP / "assets.json").read_text())
_READ = {r["reading"]: r for r in ASSETS["scale"]["readings"]}
RECOMMENDED_READING = "silhouette_area"
assert RECOMMENDED_READING in _READ


def wingbeat(creature, prototype_period):
    key = "wingbeat_hz_" + creature
    by = OrderedDict((name, round(1.0 / r[key], 2)) for name, r in _READ.items())
    return OrderedDict([
        ("source", "assets.json scale.readings[<chosen reading>].%s; period_s = 1 / that value. Same number the animation uses." % key),
        ("period_s_by_reading", by),
        ("period_s_at_recommended_reading", by[RECOMMENDED_READING]),
        ("recommended_reading", RECOMMENDED_READING + " (assets.json recommendation; Daxtyn chooses after the lineup still)"),
        ("prototype_timed_at_s", prototype_period),
        ("todo", "Re-time the prototype to the chosen reading's period before use; do not keep the prototype's tempo."),
    ])


special = OrderedDict()
def add(lid, spec, **extra):
    l = next(x for x in D["lines"] if x["id"] == lid)
    entry = OrderedDict([("speaker", l["speaker"]), ("text", l["text"]), ("original", l["original"])])
    entry.update(spec); entry.update(extra)
    special[lid] = entry

add("L011", WHISPER, note="[ORIGINAL] - exact words 'My pretty little weapon', no extra word, no punctuation added. Spoken for the hatchling, not the room.")
for lid in ("L046", "L047", "L048"):
    add(lid, {"type": "original_exact", "how": "Speak byte-exact (screenplay [ORIGINAL]). Only pronunciation respelling of 'Bashion' is allowed in the TTS input; the subtitle text never changes."})
for lid in ("L020", "L062", "L176", "L083"):
    add(lid, QUIET)
for lid in ("L075", "L086", "L100"):
    add(lid, PAIN)
add("L072", {**PAIN, **CUTOFF, "type": "through_pain+cut_off"})
for lid in ("L070", "L071", "L037", "L084", "L170", "L174", "L179", "L181", "L182", "L183", "L190"):
    add(lid, SHOUT)
for lid in ("L081", "L130", "L169", "L191"):
    add(lid, CUTOFF)
add("L171", {"type": "continues", "how": "Picks up L169 after the vendor's heckle (L170). Synthesize without the leading dash.", "continues": "L169"})
for lid in ("L078", "L079", "L080", "L082"):
    add(lid, CMD)
add("L180", {**CMD, "how": "Queen Fall: quiet authority, speed 0.85, no shout, slightly closer and drier than the surrounding chaos. Attack = physical dive (no fire)."})
add("L173", {"type": "masked", "how": "Normal volume; the festival music partly covers it (screenplay: 'swallowed by the music'). The subtitle still shows it."})
add("L042", {"type": "clear_aside", "how": "A close, intelligible aside: record or mix it close on Abby (POV intimacy), with the wind under it at normal flight-dialogue level. The joke is for Abby and the viewer, so the audience must hear it plainly (screenplay). Remi's not hearing it is shown by the distance and his lack of reply, not by masking the line. No shouted reply."})

# ------------------------------------------------------------------ measured test results (summary)
def pick(engine, voice, line, rows):
    for r in rows:
        if r.get("engine", "").startswith(engine) and r.get("voice") == voice and r.get("line") == line:
            return r

measured = OrderedDict([
    ("machine", "4-core CPU-only container, shared with a running render benchmark (load average 3-15 during tests). TTS limited to 2 threads."),
    ("network", OrderedDict([
        ("pypi.org", "OK - pip install piper-tts 1.8.0, kokoro-onnx 0.6.1, numpy, scipy, soundfile worked (~15 s)"),
        ("huggingface.co", "BLOCKED by this environment's egress policy (403). The usual Piper voice host (rhasspy/piper-voices) and Kokoro's own page could not be reached."),
        ("github.com release downloads", "OK - Piper v0.0.2 voice tarballs (rhasspy/piper) and Kokoro ONNX files (thewh1teagle/kokoro-onnx model-files-v1.0) downloaded; 9 voices + Kokoro in 24 s total"),
        ("archive.ubuntu.com", "OK - apt install espeak-ng 1.51 and sox 14.4.2 worked"),
    ])),
    ("piper_libritts_high", OrderedDict([
        ("load_s", TTSR["load_times_s"]["piper en-us-libritts-high"]),
        ("realtime_factor_2_threads", "0.29-0.35 (about 3x faster than real time)"),
        ("speaker_scan", f"{len(LSCAN)} of 904 speakers sampled; median pitch {round(min(v['f0_median_hz'] for v in LSCAN.values()))}-{round(max(v['f0_median_hz'] for v in LSCAN.values()))} Hz"),
        ("deterministic", False),
        ("note", "Same text + speaker gave different takes on two runs (Remi L046 with speaker 48: 5.07 s then 5.67 s). Keep approved WAVs; do not regenerate them."),
    ])),
    ("kokoro_int8", OrderedDict([
        ("load_s", KR["load_s"]),
        ("realtime_factor_2_threads", "1.6-2.1 (slower than real time; about 2x the line length to generate)"),
        ("english_voices", 28),
        ("deterministic", True),
        ("note", "Bit-identical output on regeneration (max sample difference 0.0). Needed the system espeak-ng library (PHONEMIZER_ESPEAK_LIBRARY=/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1); the pip espeakng-loader data path did not work with phonemizer 3.4.0."),
    ])),
    ("espeak_ng", "Instant (realtime factor <0.01) but robotic and nearly monotone (about 5 semitones of pitch movement). Temp/placeholder only."),
    ("speaking_rate_vs_dialogue_json", OrderedDict([
        ("REMI L046 (19 words, dialogue.json estimate 7.8 s)", f"Kokoro am_michael {pick('kokoro', 'am_michael', 'remi_L046_original', KR['results'])['audio_s']} s, Piper LibriTTS 4.5-5.7 s, Piper ryan-high 3.9 s"),
        ("ABBY L048 (6 words, estimate 2.3 s)", f"Kokoro af_heart {pick('kokoro', 'af_heart', 'abby_L048_original', KR['results'])['audio_s']} s, Piper LibriTTS 1.3 s"),
        ("conclusion", "At default speed TTS speaks 30-45% faster than the dialogue.json timing model. Use the role speeds below (0.85-1.0), sentence gaps, and the real take lengths for the animatic - not the estimates."),
    ])),
    ("bandwidth", "Kokoro 24 kHz output (no content above 12 kHz); Piper libritts/ryan 22.05 kHz (11 kHz); Piper 'low' voices 16 kHz (8 kHz, telephone-like). All are resampled to 48 kHz for the mix; they will sound slightly duller than a real microphone."),
    ("audition_reel", "All 18 roles rendered from THIS file by a script that reads only voices.json + dialogue.json: 55.8 s of audio in 108.7 s (1 thread, lowest priority, benchmark running). Queen Fall was auditioned before her -2 semitone change."),
    ("whisper_dsp_L011", "Harmonicity (voicing) of Alexandria's line dropped from 0.79 (plain TTS) to 0.27 after the whisper DSP: the buzz of the voice is mostly gone, as in a real whisper. It still sounds processed."),
    ("delivery_chain_test", "12 s mock mix (wind + music + Leaf + Charcoal + scout pass + two TTS lines) -> 48 kHz stereo -> limiter + 2-pass loudnorm (linear) -> AAC 256k with the same ffmpeg arguments as render/lib/ffmpeg.mjs -> soft SRT subtitles (mov_text). Result: decoded AAC -16.0 LUFS integrated, -2.0 dBTP; audio, video and file all exactly 12.000 s."),
    ("files", "Test WAVs, scans and scripts are in the session scratchpad (preprod/audio: tts/, audition/, sfx/, mockmix/ and the .py scripts); they are not part of the project and may be deleted with the session."),
])

# ------------------------------------------------------------------ assemble
out = OrderedDict([
    ("schema", "dragons-kingdom/voices v0.1"),
    ("episode", D["episode"]),
    ("series", D["series"]),
    ("status", "PROVISIONAL casting proposal. Nothing in this file has been approved by Daxtyn. No final dialogue has been recorded and nothing has been rendered. Every voice is a suggestion to audition, and any role can be replaced by a human recording."),
    ("generated", "2026-10-05"),
    ("source", OrderedDict([("dialogue", "episodes/s01e01/dialogue.json"), ("dialogue_source_sha256", D["source_sha256"]),
                            ("screenplay", "episodes/s01e01/screenplay.md"), ("plan", "episodes/s01e01/audio-plan.md")])),
    ("rules", [
        "Role keys are the speaker names exactly as in dialogue.json.",
        "One voice per role for the whole episode. Never change a role's voice between scenes, and never let two roles share a voice.",
        "The text sent to TTS is dialogue.json 'text' with the 'pronunciation' respellings applied (and a leading/trailing em dash removed). Subtitles always use the unmodified 'text'.",
        "[ORIGINAL] lines L011, L046, L047, L048 are spoken word-for-word. A respelling may change how 'Bashion' sounds, never the words.",
        "Never speak bracketed notes, delivery notes, speaker names or the [ORIGINAL] marker.",
        "Dragons never speak. Their sounds are in creature_vocals.",
        "A human recording, when one exists for a line, always replaces the TTS take (see human_recordings).",
        "An approved take is a file. Keep it. Do not regenerate approved lines (Piper differs on every run; Kokoro repeats exactly only with the same model, text, voice and speed).",
    ]),
    ("engines", OrderedDict([
        ("kokoro", OrderedDict([
            ("role", "PRIMARY for all roles (better quality than Piper in these tests; license-clean)"),
            ("model", "Kokoro-82M v1.0, ONNX int8 export (kokoro-v1.0.int8.onnx, 92 MB) + voices-v1.0.bin (28 MB)"),
            ("download", "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/"),
            ("runtime", "pip: kokoro-onnx 0.6.1 (MIT), onnxruntime 1.30 (MIT); system espeak-ng 1.51 (GPL-3.0, used as a tool for phonemes)"),
            ("license", "Model weights Apache-2.0 (commercial use allowed). kokoro-onnx MIT."),
            ("caution", "Kokoro's model card (hosted on Hugging Face, blocked here, so not re-checked from this machine) describes its training audio as public-domain and permissively licensed recordings plus synthetic audio from closed commercial TTS models. To stay clear of imitating a commercial product's voice, this casting does not use the voices named after one (af_alloy, af_nova, am_echo, am_onyx, bm_fable) or am_santa."),
            ("sample_rate", 24000),
            ("controls", "voice, speed (0.5-2.0), lang (en-us / en-gb). No pitch control: pitch_semitones is applied afterwards with SoX ('pitch <cents>'). Voices can also be blended (weighted average of the 510x256 style arrays) if more distinct voices are needed."),
            ("deterministic", True),
        ])),
        ("piper_libritts", OrderedDict([
            ("role", "FALLBACK (faster, lower quality; 904 speakers in one model)"),
            ("model", "Piper voice en-us-libritts-high (rhasspy/piper v0.0.2 release, 121 MB)"),
            ("download", "https://github.com/rhasspy/piper/releases/download/v0.0.2/voice-en-us-libritts-high.tar.gz"),
            ("runtime", "pip: piper-tts 1.8.0 (GPL-3.0-or-later; the license applies to the program, not to audio you make with it)"),
            ("license", "Dataset LibriTTS (OpenSLR 60), CC BY 4.0: commercial use allowed WITH attribution. Trained from scratch (not fine-tuned from a restricted voice)."),
            ("attribution_text", "Some voices synthesized with Piper (rhasspy) using a model trained on LibriTTS (Zen et al., CC BY 4.0)."),
            ("sample_rate", 22050),
            ("deterministic", False),
        ])),
        ("not_recommended", [
            {"voice": "piper en-us-ryan-medium / ryan-high", "reason": "Dataset RyanSpeech is CC BY-NC-SA 4.0: NON-COMMERCIAL only (and share-alike)."},
            {"voice": "piper en-us-lessac-medium", "reason": "Dataset is the Blizzard 2013 Lessac corpus under its own CSTR licence (the licence page was blocked here). That corpus is distributed for research use - treat as NON-COMMERCIAL."},
            {"voice": "piper en-us-kathleen-low", "reason": "Dataset is CC0, but the model card says it was fine-tuned from the Ryan voice (CC BY-NC-SA data): treat as NON-COMMERCIAL."},
            {"voice": "piper en-gb-southern_english_female-low", "reason": "Dataset OpenSLR 83 is CC BY-SA 4.0, but fine-tuned from Ryan (CC BY-NC-SA): treat as NON-COMMERCIAL. Also 16 kHz."},
            {"voice": "piper en-us-amy-low, en-us-danny-low", "reason": "Model card says 'License: see URL' (MycroftAI mimic3-voices) and no per-voice licence file was found; fine-tuned from Ryan. Unclear - avoid."},
            {"voice": "piper en-gb-alan-low", "reason": "Source voice (Mycroft mimic3 'apope') LICENSE reads 'Copyright 2022 Mycroft AI, All Rights Reserved'. Do not use."},
            {"voice": "espeak-ng", "reason": "Free (GPL-3.0 program) but robotic. Placeholder/temp only."},
            {"voice": "any paid or online TTS API", "reason": "Budget is free; none used or needed."},
        ]),
    ])),
    ("render_defaults", OrderedDict([
        ("working_format", "mono WAV per line, 48000 Hz, 24-bit PCM"),
        ("resample", "ffmpeg -af aresample=48000:resampler=soxr  (or: sox in.wav -b 24 out.wav rate -v 48k)"),
        ("pitch_shift", "sox in.wav out.wav pitch <semitones*100>   (apply each role's primary.pitch_semitones; roles with a non-zero shift: " + ", ".join("%s %+g" % (n, r["primary"]["pitch_semitones"]) for n, r in roles_out.items() if r["primary"]["pitch_semitones"]) + ")"),
        ("sentence_gap_s", {"default": 0.3, "NARRATOR": 0.6, "urgent_or_shouted": 0.12}),
        ("how_to_split", "Synthesize each sentence of a line separately and join with sentence_gap_s of silence; this gives control over pauses that TTS does not."),
        ("trim", "Trim leading/trailing silence to 40 ms, then add a 5 ms fade at both ends."),
        ("line_level", "Normalize every line to the same speech level (-20 dBFS RMS over the voiced part, peak below -3 dBFS). Performance level (quiet, whisper, shout) is set in the mix, not in the file."),
        ("output_path", "episodes/s01e01/audio/vo/tts/<role-slug>/<line_id>.wav  (role-slug = lowercase, spaces to '-', e.g. king-of-cling)"),
    ])),
    ("pronunciation", [
        {"word": "Bashion", "in_lines": ["L048"], "espeak_default_ipa": "bˈæʃən", "sounds_like": "BASH-un", "tts_respelling": None, "status": "ASK DAXTYN how he says it (e.g. BASH-un or BASH-ee-on). L048 is an [ORIGINAL] line."},
        {"word": "Bashions", "in_lines": ["L054"], "espeak_default_ipa": "bˈæʃənz", "sounds_like": "BASH-unz", "tts_respelling": None, "status": "Same answer as Bashion."},
        {"word": "Slitherwing", "in_lines": ["L109"], "espeak_default_ipa": "slˈɪðɚwəɪŋ", "sounds_like": "SLITHER-wuh-ing (wrong vowel)", "tts_respelling": "Slither-wing", "respelled_ipa": "slˈɪðɚwˈɪŋ", "status": "Respell for TTS input only; confirm with Daxtyn."},
        {"word": "Verdor", "in_lines": ["L003"], "espeak_default_ipa": "vˈɜːdoːɹ", "sounds_like": "VER-dor", "tts_respelling": None, "status": "ASK DAXTYN."},
        {"word": "Tara", "in_lines": ["L003"], "espeak_default_ipa": "tˈɑːɹə", "sounds_like": "TAR-uh", "tts_respelling": None, "status": "ASK DAXTYN (TAR-uh or TAIR-uh?)."},
        {"word": "Nightwings, Charcoal, Starlight, Cling, Scrapper, Santa Maria, Fallen, Citadel, Proxy, Leaf", "status": "Read as ordinary English; no change needed."},
        {"word": "Remi, Alexandria", "status": "Not spoken in any line of this episode (no pronunciation needed yet)."},
    ]),
    ("roles", roles_out),
    ("special_lines", special),
    ("creature_vocals", OrderedDict([
        ("rule", "No dragon speaks. Dragons communicate by posture, breath, growls, calls and eye movement (screenplay). These are sound-design settings, not TTS."),
        ("method", "Procedural synthesis in Python (numpy/scipy) - prototypes exist - optionally layered with Daxtyn's own recorded growls/breaths pitched down. No downloaded animal recordings unless each file is checked CC0."),
        ("CHARCOAL", {"species": "Bashion (melanistic, black)", "character": "immense, calm, slow to anger", "wingbeat": wingbeat("charcoal", 2.8), "breath": "slow, very low; rest cycle ~5-6 s", "growl_f0_hz": [25, 35], "formants_hz": [170, 410, 930, 2100],
                      "beats": ["takeoff: ground-devastation layers (turf tearing, stones, rolling dust whoosh) under the first beats", "the nip (1D): NO roar - a slow head turn, jaw movement, low breath", "brief directed fire breath on 'Fire.' (L080) - short, not sustained", "jaws/hide/equipment strain when catching the scout (1F)"],
                      "prototype": "charcoal_wingbeats_immense.wav, charcoal_breath_low_growl.wav"}),
        ("LEAF", {"species": "Nightwing, green, subadult", "character": "quick, playful, then protective", "wingbeat": wingbeat("leaf", [0.37, 0.44]), "corrections": "occasional double beats ~0.2 s apart on top of the cruise period; after the pass 'rapid and uneven'", "calls": "short chuffs/chirps, higher (pitched human vocalizations -3 to -5 semitones, or synth f0 120-300 Hz)",
                  "prototype": "leaf_wingbeats_quick_corrective.wav"}),
        ("STARLIGHT", {"species": "Nightwing, albino ('Queen of Dragons'), about twice Charcoal's size", "wingbeat": wingbeat("starlight", [3.5, 4.0]), "push_hz": [26, 30], "breath": "audible in the high aerial shot (3D)",
                       "do_not": ["no fire/breath-weapon sound (none in this episode)", "no magical shimmer or 'crystal' sound - her look is reflective scales, not magic", "no later-episode wing injury sounds"],
                       "prototype": "scale the Charcoal wingbeat: longer period, lower push, broader whoosh"}),
        ("SCOUT", {"species": "Slitherwing (small, extremely fast)", "sound": "thin hiss, rapid wing flutter (~8-12 beats/s), the sharp pass crack (1E), distress when caught, weak effort in the water", "prototype": "scout_pass_sharp_crack.wav (enters RIGHT, exits LEFT, matching the shot list's pass direction)", "pass_geometry": "shotlist.json conventions.the_pass_1E: the scout comes head-on from ahead and passes through the gap between Leaf and Charcoal, on Leaf's LEFT (seaward) side = the FAR side from the inland camera, never between Leaf and the camera. Pan R -> L, slightly behind Leaf in the image (a little less direct than a camera-side pass); the wake then surrounds the listener. In the 1E-04 front shot the wake comes from screen RIGHT (Abby's left)."}),
        ("HATCHLING", {"species": "Bashion, 24-karat gold", "sound": "faint effortful sounds, tiny breaths, scrapes inside the shell; fragile, never cute squeaks", "prototype": "egg_scratch_then_crack.wav"}),
    ])),
    ("human_recordings", OrderedDict([
        ("recommended_first", ["ABBY", "REMI", "ALEXANDRIA", "KING OF CLING"]),
        ("why", "These four carry the emotion (pain, fear, whisper, command, warmth). TTS is fine for temporary animatic audio and acceptable for minor roles."),
        ("path", "episodes/s01e01/audio/vo/human/<role-slug>/<line_id>_take<N>.wav  e.g. audio/vo/human/abby/L072_take2.wav"),
        ("choice_file", "episodes/s01e01/audio/vo/takes.json  {\"L072\": \"human/abby/L072_take2.wav\", ...}; a line not listed uses the TTS take"),
        ("format", "WAV preferred (48 kHz, 24-bit). Phone recordings (m4a) are fine - they get converted with ffmpeg."),
        ("consent", "Get each person's OK to use their voice in the published episode; a parent's OK for anyone under 18. Credit them by name only if they want, in the end titles (the screenplay says credit only real contributors)."),
    ])),
    ("measured_tests", measured),
])

(Path(__import__("os").environ.get("VOUT", str(EP / "voices.json")))).write_text(json.dumps(out, indent=2, ensure_ascii=False) + "\n")
print("wrote", EP / "voices.json", len(json.dumps(out)), "bytes;", len(roles_out), "roles;", len(special), "special lines")
