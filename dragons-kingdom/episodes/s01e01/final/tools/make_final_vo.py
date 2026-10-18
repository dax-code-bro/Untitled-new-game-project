#!/usr/bin/env python3
"""make_final_vo.py - computer-voice takes for EVERY spoken line of the Episode 1 shooting script.

Scope: all 385 lines of final/dialogue.json (handoff lines, proposed additions and the rating pass, in the
wording Daxtyn approved on 2026-10-18), plus clearly labelled PLACEHOLDERS for the voice moments that text
to speech cannot perform: the sung verse R13-01 and the screams / cries the screenplay asks for (1E, 1F, X12).
Every placeholder is listed for a real recording.

Method: the preview's tool, reused, not copied. The voice engine, the performance DSP (whisper, quiet, pain,
shout, firm command, cut-off), level matching and the pocketsphinx check all come from
../../preview/tools/make_vo.py (imported as a module; its sha256 is recorded in takes.json). Settings for the
preview's lines L001-L078 are unchanged, so every take whose text did not change is byte-identical to the
preview take (checked). This script adds: the full-episode cast from final/voices.json (including the four
blended voices), performance choices for the lines after 1E, the sung placeholder, the non-verbal placeholders,
and the full-episode checks.

Reads (never modifies): ../dialogue.json, ../voices.json, ../shotlist.json, ../screenplay-final.md,
                        ../../screenplay.md, ../../preview/tools/make_vo.py, ../../preview/vo/takes.json
Writes (relative to episodes/s01e01/final/):
  vo/<line_id>.wav                   48 kHz mono 24-bit PCM dry take (git-ignored)
  vo/R13-01.PLACEHOLDER.wav          the sung verse, spoken in rhythm (TEMP; git-ignored)
  vo/nonverbal/NV-*.PLACEHOLDER.wav  scream / cry stand-ins (TEMP; git-ignored)
  vo/takes.json                      one record per line + placeholders, checks, human-recording list
  vo/words.json                      word timings (pocketsphinx forced alignment)
  vo/takes.md                        the same summary for people (counts, cast, list for real recording)

Usage (the preview venv: ../../preview/tools/requirements-vo.txt; espeak-ng 1.51 and SoX 14.4.2 on PATH):
  python -I make_final_vo.py                  render everything (4 worker processes), then verify
  python -I make_final_vo.py --only X9-01,R13-01,NV-1F-14   render only these (takes.json keeps the rest)
  python -I make_final_vo.py --verify         verify the existing files only
  python -I make_final_vo.py --repeat-check sample        render again in a fresh process, compare sha256
  python -I make_final_vo.py --repeat-check L011,X27-01

Environment: DK_KOKORO_DIR (model folder), DK_THREADS (onnxruntime threads per worker, default 1),
DK_JOBS (worker processes, default min(4, CPUs)), DK_TMP (temporary folder for SoX round trips),
DK_ESPEAK_LIB / DK_ESPEAK_DATA (espeak-ng library and data; default the system 1.51 install, else the copy
bundled with espeakng-loader - Windows/macOS - which can phonemize differently, so takes made there are not
expected to be byte-identical: copy the WAVs instead of regenerating them).

Determinism: same as the preview (Kokoro with 1 thread, SoX -R -D, every noise source seeded from the line id).
"""
import argparse
import hashlib
import json
import os
import re
import sys
import tempfile
import time
import zlib
from concurrent.futures import ProcessPoolExecutor
from pathlib import Path

import numpy as np
import soundfile as sf
from scipy import signal

HERE = Path(__file__).resolve().parent          # episodes/s01e01/final/tools
FINAL = HERE.parent                             # episodes/s01e01/final
EP = FINAL.parent                               # episodes/s01e01
REPO = EP.parents[2]
PREVIEW_TOOLS = EP / "preview" / "tools"
sys.path.insert(0, str(PREVIEW_TOOLS))
import make_vo as mv  # noqa: E402  (the preview's engine + DSP, reused unchanged)

VO = FINAL / "vo"
NV_DIR = VO / "nonverbal"
REL = lambda p: Path(p).resolve().relative_to(REPO).as_posix()  # noqa: E731
SR, SR_TTS = mv.SR, mv.SR_TTS
SEED_BASE = mv.SEED_BASE
APPROVED_TAG = "[creator-approved wording 2026-10-18]"
SPECIES_RE = re.compile(r"bashion|nightwing|slitherwing", re.I)
STRONG_RE = re.compile(r"\b(fuck\w*(?:['’]s)?|shit\w*|bastard\w*|damn\w*|bloody)(?![\w'’])", re.I)
CUTOFF_S = 0.075   # voices.json special_lines cut_off: 60-90 ms before the natural end, 10-15 ms fade
PLACEHOLDER_TAG = "PLACEHOLDER"

# pocketsphinx (check only): words missing from its dictionary
mv.PS_EXTRA_WORDS.update({"gawping": "G AO P IH NG", "hatchling": "HH AE CH L IH NG"})

AIR_SETS = {"SKY_OFF_VERDOR", "COASTAL_SKY_WATER", "CLING_SKY", "VERDOR_AERIAL"}
SPACES = {  # audio-plan.md "Spaces" where it has an entry; the rest are proposed here (marked)
    "NARRATION": ("non-diegetic narration: dry, no room", "audio-plan.md"),
    "BIRTHING_CHAMBER": ("small warm room (birthing chamber)", "audio-plan.md"),
    "TREATMENT_ROOM": ("small dry room (treatment room)", "audio-plan.md"),
    "VERDOR_GROUNDS": ("open air, little reverb (riding grounds)", "audio-plan.md"),
    "VERDOR_HARBOR": ("open air, little reverb (harbor)", "audio-plan.md"),
    "CLING_SQUARE": ("stone reflections (Cling square)", "audio-plan.md"),
    "SKY_OFF_VERDOR": ("sky: almost no reverb; wind bed added in the mix", "audio-plan.md"),
    "COASTAL_SKY_WATER": ("sky: almost no reverb; wind bed added in the mix", "audio-plan.md"),
    "CLING_SKY": ("sky: almost no reverb; wind bed added in the mix", "audio-plan.md"),
    "VERDOR_AERIAL": ("sky: almost no reverb; wind bed added in the mix", "audio-plan.md (sky)"),
    "SANTA_MARIA_DECK": ("open air, little reverb (ship's deck at the quay)", "proposed (audio-plan.md: harbor)"),
    "RIDING_SCHOOL_FIELD": ("open air, little reverb (field above the harbor)", "proposed (audio-plan.md: field)"),
    "CLING_ROAD": ("open air, little reverb (road outside Cling)", "proposed"),
    "OUTER_ROCKS": ("open sea among the stacks: short slap from the rock, surf and wind", "proposed"),
    "ALEXANDRIA_ROOM": ("small stone room (the queen's room)", "proposed"),
    "PALACE_CORRIDOR": ("stone corridor, a longer tail than the rooms", "proposed"),
}

# --------------------------------------------------------------------------------------------- performance
# The preview's presets (mv.PRESETS) plus five more, built only from the same DSP keys.
PRESETS = dict(mv.PRESETS)
PRESETS.update({
    # Abby after the pass (1E onward): "pain narrows her voice without eliminating her personality"
    # (voices.json ABBY direction). A lighter version of the preview's pain chain, no pitch rise, no tremor.
    "hurt": {"speed_mul": 0.95, "breathy": 0.15, "eq": [("highpass", 150.0, 0.0, 0.707), ("peak", 350.0, -2.0, 1.0)],
             "mix_gain_db": -0.5},
    # "low" / "to himself" / "under his breath" / "barely audible": like quiet, a touch less slow
    "low": {"speed_mul": 0.95, "breathy": 0.10, "eq": [("highshelf", 4000.0, -2.0, 0.707)], "mix_gain_db": -4.0},
    "breathless": {"speed_mul": 1.03, "breathy": 0.12, "breath": "inhale", "gap_s": 0.2},
    "resigned": {"speed_mul": 0.95, "mix_gain_db": -2.0},
    # Queen Fall's "Attack.": quiet authority, no shout, no drive (voices.json special_lines.L180)
    "command_quiet": {"tail_keep_s": 0.02, "mix_gain_db": 0.0},
    "sung_placeholder": {"speed_mul": 0.92, "eq": [("highshelf", 4000.0, -2.0, 0.707)], "mix_gain_db": -4.0},
})

# line id -> (preset, overrides, why). The preview's own table (mv.PERF, L001-L078) is kept unchanged so its
# takes stay valid; the entries below cover the lines after 1E and the additions. Lines not listed fall to the
# rules in line_perf() (special_lines type, narrator, Abby after the injury, plain).
FINAL_PERF = {
    "X1-01": ("breathless", {}, "Breathless at the door; trying not to have run (dialogue.json delivery)."),
    "X2-02": ("quiet", {"speed_mul": 0.95, "mix_gain_db": -3.0}, "Quiet, private: the one thing she asks of her son."),
    "X6-06": ("resigned", {}, "To Charcoal, resigned (performance note)."),
    "X7-01": ("low", {}, "Under his breath, working it out (delivery)."),
    "L079": ("command", {}, "Short and firm (voices.json special_lines.L079); a rider instruction, not a canonical word."),
    "X8-01": ("low", {"mix_gain_db": -3.0}, "To himself, spotting the scout's shadow; low and hard. Strong language spoken as written."),
    "L080": ("command", {}, "Canonical command 'Fire' (breath weapon). Short, firm, no exclamation (special_lines.L080)."),
    "L081": ("command", {"cutoff_s": CUTOFF_S}, "Canonical 'Hold', begun mid-struggle and cut off as the wing tears "
             "(special_lines.L081: cut 60-90 ms before the natural end)."),
    "L082": ("raised", {"speed_mul": 1.0, "mix_gain_db": 2.5},
             "'Hold!' firm, complete (performance note): the full stop command, raised over the struggle. The first "
             "version (command preset, +1.5 st, drive 1.8) was not confirmed by the recognizer; neither was the plain "
             "command preset, whose 20 ms tail clips the final 'd'. This raised read is."),
    "X9-01": ("pain", {"mix_gain_db": -3.0}, "Through pain, to herself (special_lines.X9-01)."),
    "X9-02": ("shout", {}, "Shouted down from the masthead (special_lines.X9-02)."),
    "X9-03": ("urgent", {}, "Work stops on the quay; quick question."),
    "X9-04": ("firm", {}, "An order to his crew."),
    "L084": ("shout", {}, "Shouted as Leaf returns alone and too urgently (delivery)."),
    "L085": ("urgent", {}, "Worried, seeing Abby hunched over the saddle (delivery)."),
    "L096": ("urgent", {}, "Clipped, practical (delivery)."),
    "L114": ("hurt", {"mix_gain_db": -3.0}, "Quiet, still shaken (delivery); hurt voice."),
    "L128": ("hurt", {"mix_gain_db": -3.0}, "Small (delivery); hurt voice."),
    "X13-04": ("low", {"mix_gain_db": -8.0}, "'Barely audible', to herself (delivery)."),
    "X16-01": ("shout", {}, "Ship's order across the deck (special_lines.X16-01)."),
    "X16-02": ("raised", {}, "Calling the young riders in across the field after one clap."),
    "X22-08": ("breathless", {}, "The child runs back out of breath (delivery)."),
    "L173": ("plain", {}, "Normal volume; the festival music partly covers it in the mix (special_lines.L173 masked)."),
    "L174": ("shout", {}, "He raises his voice: the alarm (special_lines.L174)."),
    "L175": ("urgent", {"speed_mul": 1.0}, "Turning; sharp (delivery). Role speed kept: at x1.05 the recognizer "
             "could not confirm the one-word line; at x1.0 it can."),
    "L178": ("firm", {}, "Practical under pressure; final (delivery)."),
    "L179": ("shout", {}, "Shouted orders to the crowd (delivery)."),
    "L180": ("command_quiet", {}, "Queen Fall: quiet authority, no shout; slightly closer and drier than the chaos "
             "(special_lines.L180). Attack = the physical dive, no flame."),
    "L181": ("shout", {}, "Shouted, reaching for the king (delivery)."),
    "L182": ("shout", {}, "Shouted while pulling toward his people (delivery)."),
    "R14-01": ("shout", {}, "Shouted at his guards (special_lines.R14-01). Strong language spoken as written."),
    "L183": ("shout", {}, "Shouted as fragments fly past (delivery)."),
    "L184": ("urgent", {}, "Urgent, reaching the arch with the child (delivery)."),
    "L185": ("urgent", {"mix_gain_db": 0.0}, "Frightened, in the dust (delivery)."),
    "L186": ("firm", {}, "Steady and protective (delivery). Not a dragon command."),
    "L187": ("urgent", {}, "Reaching the king in the chaos."),
    "L188": ("firm", {}, "Refusing to go first (delivery)."),
    "L189": ("urgent", {}, "Looking up; the warning is true (delivery)."),
    "L190": ("shout", {}, "Crawling clear of the wrecked stall (special_lines.L190)."),
    "X26-01": ("shout", {}, "Shouts down into the square from his post (special_lines.X26-01). Strong language spoken as written."),
    "L191": ("urgent", {}, "Injured, conscious, frightened; the king cuts in (delivery)."),
    "L192": ("firm", {}, "Practical; no empty promise (delivery)."),
    "X27-02": ("raised", {"mix_gain_db": 1.0}, "Calling into the wreckage for survivors."),
    "L194": ("quiet", {"speed_mul": 1.0, "breathy": 0.06, "mix_gain_db": -2.5}, "Quiet working orders, not a speech (delivery)."),
    "L195": ("quiet", {"speed_mul": 1.0, "mix_gain_db": -3.0}, "Subdued (delivery)."),
    "L198": ("firm", {}, "The last spoken line of the episode: plain and heavy (delivery)."),
    "X28-05": ("quiet", {"speed_mul": 1.0}, "The child in the shelter, afterward."),
    "X28-06": ("quiet", {"speed_mul": 1.0, "mix_gain_db": -3.0}, "Crouched at the shelter; no promise he cannot keep (delivery)."),
    "R13-01": ("sung_placeholder", {}, "Sung low (performance note). Kokoro cannot sing: PLACEHOLDER read in a steady "
               "rhythm, one phrase per bar, so the scene can be cut; record it with a person (special_lines.R13-01)."),
}
SPECIAL_TO_PRESET = {"whisper": "whisper", "quiet": "quiet", "through_pain": "pain", "pain": "pain",
                     "raised_voice": "raised", "dragon_command": "command", "clear_aside": "aside"}

# The sung verse: TTS phrases (word for word the line, split where the verse's lines break)
SUNG_PHRASES = {"R13-01": ["The miller's wife had flour to sell", "and sold it twice a day,",
                           "and the miller never asked her why", "the baker came to stay."]}
SUNG_TEMPO_BPM = 100.0       # placeholder rhythm: each phrase starts on a bar (4 beats)
SUNG_BEATS_PER_PHRASE = 4

# Non-verbal voice moments the screenplay asks for that TTS cannot perform. PLACEHOLDERS only.
NONVERBAL = [
    {"id": "NV-1E-04", "who": "ABBY", "scene": "1E", "shots": ["1E-04"], "kind": "startled breath and cry",
     "screenplay": "SOUND: ... Abby's startled breath. ... PICTURE: ... Her left arm is wrenched violently. She cries out "
                   "and immediately pulls that arm inward.",
     "method": "abby_cry", "mix_gain_db": -1.0,
     "how_made": "Abby's own voice (Kokoro af_heart) saying 'Ah!' through the preview's pain chain, pitched up 2.5 semitones "
                 "(formant-preserving), breathy, shaking, cut to 0.55 s, after a synthetic gasp: the same recipe as the "
                 "preview soundtrack's abby_cry stand-in."},
    {"id": "NV-1F-09", "who": "ABBY", "scene": "1F", "shots": ["1F-09"], "kind": "gasp of pain",
     "screenplay": "Intercut Abby approaching Verdor. She tries to shift her left arm and stops with a gasp.",
     "method": "abby_gasp", "mix_gain_db": -8.0,
     "how_made": "Synthetic gasp (the preview's breath generator) with a shaky, broken exhale after it."},
    {"id": "NV-1F-14", "who": "the scout rider (unidentifiable)", "scene": "1F", "shots": ["1F-14"], "kind": "scream",
     "screenplay": "Outer cloth and leather catch; the rider screams, a raw, wordless sound loud enough to carry over the "
                   "wind; keep the voice unidentifiable.",
     "method": "rider_scream", "mix_gain_db": 4.0,
     "how_made": "Procedural source-filter synthesis (no cast voice, so it points at nobody): a rough glottal source at "
                 "300-560 Hz with jitter and a subharmonic break, open-vowel formants, breath noise, saturation. "
                 "Deliberately unidentifiable (CANON LOCK 11); layer it with wind in the mix."},
    {"id": "NV-X12-04", "who": "ABBY", "scene": "2C", "shots": ["X12-04"], "kind": "short sharp cry, cut off by her breath",
     "screenplay": "Abby's cry is short and sharp and cut off by her own breath. Her grip on her mother's hand goes white.",
     "method": "abby_cry_cut", "mix_gain_db": 0.0,
     "how_made": "Abby's voice (af_heart) 'Ah!' through the pain chain, pitched up 3 semitones, cut hard after 0.3 s, "
                 "then a sharp synthetic in-breath."},
]
# Voice moments to record with people (or from CC0 libraries) for which no placeholder is made here
GROUP_VOICES = [
    {"what": "the old song at the shared table: most of the table singing or humming, the vendor singing badly and "
             "loudly, the watchman humming", "where": "3A, X22 (shots X22-04 to X22-07)",
     "note": "No lyrics exist. If it is sung rather than hummed, its words must be newly written for the series "
             "(screenplay X22 note). A group recording, never one voice looped."},
    {"what": "crowd screams and calls in the attack; distant screams after the first impact", "where": "3C (3C-11, R15-01, X25/X26)",
     "note": "Built from many short human takes (a volunteer group, or CC0 crowd libraries recorded in the manifest), "
             "never one looped scream (voices.json non_verbal_human.crowd_3C)."},
    {"what": "distant cries and coughing in the aftermath", "where": "3D (SOUND: 'distant cries')", "note": "Group / library."},
    {"what": "walla and reactions: laughter at the festival (the adults at the table, the partner), Abby's laugh over the "
             "harbor, the instructor's distant call, the lookout's laugh", "where": "1C (X4-13), 3A", "note": "Group / library."},
    {"what": "breaths and efforts: the climb (X3), the gate (X14), the beam (X28)", "where": "1B, 2C, 3D",
     "note": "Recorded or from CC0 libraries, not synthesized (voices.json non_verbal_human.breaths)."},
]


# --------------------------------------------------------------------------------------------- utils
def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


def seed_for(key, salt):
    return (SEED_BASE + zlib.crc32(f"{key}:{salt}".encode())) % (2 ** 32)


def fade(x, a_s, b_s, sr=SR):
    y = x.copy()
    a, b = int(a_s * sr), int(b_s * sr)
    if a:
        y[:a] *= np.sin(np.linspace(0, np.pi / 2, a)) ** 2
    if b:
        y[-b:] *= np.cos(np.linspace(0, np.pi / 2, b)) ** 2
    return y


def place(out, x, i0):
    i1 = min(len(out), i0 + len(x))
    out[i0:i1] += x[: i1 - i0]


def write_wav(path, x, placeholder_note=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    with sf.SoundFile(str(path), "w", SR, 1, subtype="PCM_24", format="WAV") as f:
        if placeholder_note:  # LIST/INFO chunk, written before the audio (libsndfile rule)
            f.title = placeholder_note[:120]
            f.comment = placeholder_note
            f.software = "make_final_vo.py (Dragon's Kingdom S01E01)"
        f.write(x)
    return mv.sha256_file(path)


def words_of(t):
    return mv.words_of(t)


# --------------------------------------------------------------------------------------------- data
def load():
    D = json.loads((FINAL / "dialogue.json").read_text(encoding="utf-8"))
    V = json.loads((FINAL / "voices.json").read_text(encoding="utf-8"))
    S = json.loads((FINAL / "shotlist.json").read_text(encoding="utf-8"))
    return D, V, S


def shots_by_line(S):
    out = {}
    for sh in S["shots"]:
        for d in sh.get("dialogue") or []:
            out.setdefault(d["id"], []).append({"shot": sh["id"], "set": sh["set"], "on_screen": d.get("speaker_on_screen")})
    return out


def role_cast(V, role):
    r = V["roles"][role]
    p = r["primary"]
    assert p["engine"] == "kokoro", f"{role}: Kokoro voices only (license-clean)"
    parts = [(b["voice"], float(b["weight"])) for b in p.get("blend", [])] or [(p["voice"], 1.0)]
    for v, _ in parts:
        assert v not in mv.EXCLUDED_VOICES, f"{role}: {v} is on the do-not-cast list"
    assert abs(sum(w for _, w in parts) - 1.0) < 1e-9, f"{role}: blend weights must sum to 1"
    gap = r.get("sentence_gap_s", V["render_defaults"]["sentence_gap_s"]["default"])
    return {"engine": "kokoro", "model": "Kokoro-82M v1.0 int8 ONNX", "voice": p["voice"], "parts": parts,
            "blend": len(parts) > 1, "lang": p["lang"], "speed": p["speed"], "pitch_semitones": p.get("pitch_semitones", 0.0),
            "sentence_gap_s": gap, "license": mv.VOICE_LICENSE, "source": f"final/voices.json roles.{role}.primary",
            "human_recording_priority": r.get("human_recording_priority")}


def injury_seq(D):
    return next(l["seq"] for l in D["lines"] if l["id"] == "L072")


def line_perf(l, V, cast, inj_seq):
    lid = l["id"]
    sp = V["special_lines"].get(lid) or {}
    rule = None
    if lid in mv.PERF:
        preset, over, why = mv.PERF[lid]; rule = "preview make_vo.PERF (unchanged)"
    elif lid in FINAL_PERF:
        preset, over, why = FINAL_PERF[lid]; rule = "make_final_vo.FINAL_PERF"
    elif sp.get("type") in SPECIAL_TO_PRESET:
        preset = SPECIAL_TO_PRESET[sp["type"]]
        over = {"speed_mul": 0.95} if preset == "quiet" and "x0.95" in sp.get("how", "") else {}
        why = f"voices.json special_lines.{lid} ({sp['type']}): {sp.get('how', '')}"
        rule = "special_lines type"
    elif l["speaker"] == "NARRATOR":
        preset, over, why = "narration", {}, "Clear, restrained, sparse narration; long pauses (voices.json NARRATOR)."
        rule = "narrator"
    elif l["speaker"] == "ABBY" and l["seq"] > inj_seq:
        preset, over = "hurt", {}
        why = ("Abby after the pass: pain narrows her voice without eliminating her personality (voices.json ABBY direction). "
               "Delivery: " + (l.get("delivery") or "-"))
        rule = "Abby after the injury (L072)"
    else:
        preset, over = "plain", {}
        why = "Conversational; delivery note: " + (l.get("delivery") or "-")
        rule = "default"
    p = dict(PRESETS[preset]); p.update(over)
    if l["interrupted"] and "cutoff_s" not in p:
        p["cutoff_s"] = CUTOFF_S
        why += " Cut off (em dash): the take stops 75 ms before the natural end of its last word (special_lines cut_off)."
    speed = p["speed_abs"] if "speed_abs" in p else cast["speed"] * p.get("speed_mul", 1.0)
    gap = p.get("gap_s") if p.get("gap_s") is not None else cast["sentence_gap_s"]
    return preset, p, round(float(speed), 4), gap, why, rule


# --------------------------------------------------------------------------------------------- engine
class Engine:
    """The preview's Kokoro engine (make_vo.Engine), with two additions: voice blends (weighted sum of the style
    arrays, final/voices.json primary.blend) and an espeak-ng fallback for machines without the system 1.51."""

    def __init__(self, threads):
        import shutil
        import subprocess
        src = "system espeak-ng (DK_ESPEAK_LIB / DK_ESPEAK_DATA, default the Ubuntu 1.51 path)"
        if not Path(mv.ESPEAK_LIB).is_file():
            import espeakng_loader
            mv.ESPEAK_LIB, mv.ESPEAK_DATA = espeakng_loader.get_library_path(), espeakng_loader.get_data_path()
            src = "espeakng-loader's bundled espeak-ng (fallback: phonemes may differ from takes made with 1.51)"
        if shutil.which("espeak-ng"):
            self._e = mv.Engine(threads)
        else:  # make_vo.Engine asks the espeak-ng program for its version; without it, say so instead
            class _NoCli:
                stdout = "espeak-ng program not on PATH"
            orig = subprocess.run
            subprocess.run = lambda cmd, *a, **k: _NoCli() if cmd[:1] == ["espeak-ng"] else orig(cmd, *a, **k)
            try:
                self._e = mv.Engine(threads)
            finally:
                subprocess.run = orig
        self.kok = self._e.kok
        self.info = dict(self._e.info)
        self.info["espeak_source"] = src
        self.info["dsp_module"] = {"path": REL(PREVIEW_TOOLS / "make_vo.py"), "sha256": mv.sha256_file(PREVIEW_TOOLS / "make_vo.py")}
        self._styles = {}

    def style(self, cast):
        if not cast["blend"]:
            return cast["voice"]
        key = cast["voice"]
        if key not in self._styles:
            s = None
            for v, w in cast["parts"]:
                term = np.float32(w) * self.kok.voices[v]
                s = term if s is None else s + term
            self._styles[key] = s.astype(np.float32)
        return self._styles[key]

    def style_sha256(self, cast):
        st = self.style(cast)
        return None if isinstance(st, str) else sha256_bytes(np.ascontiguousarray(st).tobytes())

    def say(self, text, voice, speed, lang):
        return self._e.say(text, voice, speed, lang)

    def phonemes(self, text, lang):
        return self._e.phonemes(text, lang)


# --------------------------------------------------------------------------------------------- renderers
def render_line(eng, l, V, cast, perf):
    preset = perf[0]
    rc = dict(cast); rc["voice"] = eng.style(cast)
    if preset == "sung_placeholder":
        return render_sung(eng, l, V, rc, perf)
    x, rec = mv.render(eng, l, V, rc, perf[:5])
    return x, rec


def render_sung(eng, l, V, cast, perf):
    """Spoken-rhythm stand-in for a sung line: each phrase of the verse synthesized on its own and started on
    a bar of a steady pulse (SUNG_TEMPO_BPM), low and a little slow. Not singing; labelled PLACEHOLDER."""
    lid = l["id"]
    preset, p, speed, gap, why = perf[:5]
    phrases = SUNG_PHRASES[lid]
    assert words_of(" ".join(phrases)) == words_of(l["text"]), f"{lid}: phrases must be the line, word for word"
    bar = 60.0 / SUNG_TEMPO_BPM * SUNG_BEATS_PER_PHRASE
    beat = 60.0 / SUNG_TEMPO_BPM
    parts, segs, t = [], [], 0.0
    for i, ph in enumerate(phrases):
        a = eng.say(ph, cast["voice"], speed, cast["lang"])
        a0, a1 = mv.speech_bounds(a, SR_TTS)
        a = a[max(0, a0 - int(0.01 * SR_TTS)): a1 + int(0.01 * SR_TTS)]
        if i:
            nxt = max(t + 0.12, np.ceil((t + 0.12) / beat) * beat)  # next free beat after a breath
            start = max(i * bar, nxt)
        else:
            start = 0.0
        parts.append((int(round(start * SR_TTS)), a))
        segs.append([ph, int(round(start * SR_TTS)), int(round(start * SR_TTS)) + len(a)])
        t = start + len(a) / SR_TTS
    n = max(i0 + len(a) for i0, a in parts)
    x = np.zeros(n)
    for i0, a in parts:
        x[i0:i0 + len(a)] += a
    steps = [f"sung PLACEHOLDER: {len(phrases)} phrases, each synthesized alone and started on a bar of a "
             f"{SUNG_TEMPO_BPM:.0f} bpm pulse ({bar:.2f} s; later if the phrase before runs long)"]
    x, _ = mv.sox(x, SR_TTS, "rate", "-v", str(SR)); steps.append("resample 24 kHz -> 48 kHz (SoX rate -v)")
    scale = len(x) / max(n, 1)
    x = mv.eq(x, p["eq"]); steps.append("eq: highshelf 4000 Hz -2.0 dB (sung low)")
    x, ds = mv.deess(x); steps.append("de-ess: as the preview")
    sp_a, _ = mv.speech_bounds(x, SR)
    x, off = mv.trim(x, SR, mv.EDGE_KEEP_S, mv.EDGE_KEEP_S)
    shift = off - sp_a
    steps.append("trim: 40 ms lead, 40 ms tail, 5 ms fades")
    x, lim = mv.normalize(x); steps.append("normalize: voiced RMS -20 dBFS, look-ahead limiter at -3 dBFS")
    segments = [{"text": s, "start_s": round((a * scale + shift) / SR, 3), "end_s": round((b * scale + shift) / SR, 3)}
                for s, a, b in segs]
    rec = {"deess": ds, "limiter_max_gr_db": lim, "steps": steps, "segments": segments, "cut_at_s": None,
           "breath_s": 0.0, "tts_input": l["text"], "tts_phrases": phrases, "whisper_check": None}
    return x, rec


def kokoro_cry(eng, key, pitch_st, breathy, trem, keep_s, fade_out_s):
    a = eng.say("Ah!", "af_heart", 1.0, "en-us")
    a = mv.pitch_shift_fp(a, SR_TTS, pitch_st)
    w, _ = mv.lpc_noise(a, SR_TTS, np.random.default_rng(seed_for(key, "breathy")), tilt=0.5)
    a = np.sqrt(1 - breathy * breathy) * a + breathy * w
    a, _ = mv.sox(a, SR_TTS, "rate", "-v", str(SR))
    a = mv.tremor(a, SR, np.random.default_rng(seed_for(key, "tremor")), *trem)
    a = mv.eq(a, [("highpass", 170.0, 0.0, 0.707), ("peak", 350.0, -3.0, 1.0), ("peak", 2500.0, 2.0, 1.0)])
    a0, a1 = mv.speech_bounds(a, SR)
    a = a[a0: min(a1, a0 + int(keep_s * SR))]
    a = fade(a, 0.004, fade_out_s)
    a, _ = mv.normalize(a)
    return a


def rider_scream(key, sr=SR):
    """Procedural scream: rough glottal source -> open-vowel formants -> saturation. No cast voice."""
    rng = np.random.default_rng(seed_for(key, "scream"))
    dur = 1.75
    n = int(dur * sr)
    t = np.arange(n) / sr

    def wander(rate_hz, depth):
        k = max(2, int(dur * rate_hz) + 2)
        return np.interp(t, np.linspace(0, dur, k), rng.standard_normal(k)) * depth

    f0 = np.interp(t, [0, 0.06, 0.25, 0.85, 1.2, 1.42, 1.75], [300, 470, 560, 515, 545, 430, 350])
    f0 = f0 * (1 + wander(25, 0.02) + 0.03 * np.sin(2 * np.pi * 7.3 * t + rng.uniform(0, 6.28)))
    phase = 2 * np.pi * np.cumsum(f0) / sr
    src = np.zeros(n)
    for k in range(1, 40):
        m = (k * f0) < 9000.0
        src += m * np.sin(k * phase) / k ** 1.1
    # subharmonic break (period doubling) in the strained middle, and at the crack near the end
    sub_env = np.clip(np.interp(t, [0, 0.3, 0.5, 0.9, 1.25, 1.4, 1.75], [0, 0, 0.35, 0.2, 0.15, 0.5, 0.3]), 0, 1)
    src = src * (1 + sub_env * np.sin(phase / 2))
    asp = signal.sosfilt(signal.butter(2, [1200, 8000], "bandpass", fs=sr, output="sos"), rng.standard_normal(n))
    asp *= (0.55 + 0.45 * np.cos(phase)) * 0.35 * np.std(src) / max(np.std(asp), 1e-12)
    x = src + asp
    for fc, bw in ((850, 120), (1350, 140), (2650, 220), (3600, 280), (4600, 360)):
        r = np.exp(-np.pi * bw / sr)
        th = 2 * np.pi * fc / sr
        x = signal.lfilter([1 - r], [1, -2 * r * np.cos(th), r * r], x)
    env = np.interp(t, [0, 0.05, 0.25, 1.3, 1.45, 1.6, 1.75], [0, 0.85, 1.0, 0.95, 0.6, 0.35, 0.0])
    env *= 1 + wander(18, 0.08)
    for g0 in (1.33, 1.52):  # two short breaks where the voice gives out
        env *= 1 - 0.7 * np.exp(-0.5 * ((t - g0) / 0.012) ** 2)
    x = x * np.clip(env, 0, None)
    x = mv.saturate(x, 2.2)
    x = signal.sosfilt(signal.butter(2, 120, "high", fs=sr, output="sos"), x)
    x = fade(x, 0.01, 0.08)
    y, _ = mv.normalize(x)
    return y


def render_nonverbal(eng, nv):
    key = nv["id"]
    if nv["method"] == "abby_cry":
        cry = kokoro_cry(eng, key, 2.5, 0.35, (3.0, 40.0), 0.55, 0.12)
        gasp, _ = mv.breath(SR, "gasp", np.random.default_rng(seed_for(key, "gasp")))
        out = np.zeros(int((0.42 + len(cry) / SR + 0.1) * SR))
        place(out, gasp * 1.6, 0)
        place(out, cry * 10 ** (-2 / 20), int(0.42 * SR))
    elif nv["method"] == "abby_cry_cut":
        cry = kokoro_cry(eng, key, 3.0, 0.30, (2.5, 35.0), 0.30, 0.008)
        gasp, _ = mv.breath(SR, "gasp", np.random.default_rng(seed_for(key, "gasp")))
        out = np.zeros(int((len(cry) / SR + 0.03 + len(gasp) / SR + 0.1) * SR))
        place(out, cry, 0)
        place(out, gasp * 2.0, len(cry) + int(0.03 * SR))
    elif nv["method"] == "abby_gasp":
        rng = np.random.default_rng(seed_for(key, "gasp"))
        g, _ = mv.breath(SR, "gasp", rng)
        g = mv.tremor(g, SR, rng, 2.0, 30.0)
        ex, _ = mv.breath(SR, "inhale", rng)
        ex = mv.tremor(ex[::-1], SR, rng, 4.0, 45.0) * 0.6   # broken, shaky exhale
        out = np.zeros(int((len(g) + len(ex)) / SR * SR + 0.5 * SR))
        place(out, g, 0)
        place(out, ex, len(g) + int(0.32 * SR))
    elif nv["method"] == "rider_scream":
        out = rider_scream(key)
    else:
        raise KeyError(nv["method"])
    out = np.concatenate([np.zeros(int(mv.EDGE_KEEP_S * SR)), out, np.zeros(int(mv.EDGE_KEEP_S * SR))])
    y, lim = mv.normalize(out)
    return y, lim


# --------------------------------------------------------------------------------------------- workers
_ENG = None


def _init_worker(threads, tmp):
    global _ENG
    if tmp:
        Path(tmp).mkdir(parents=True, exist_ok=True)
        tempfile.tempdir = tmp
    _ENG = Engine(threads)


def take_path(lid, placeholder):
    return VO / (f"{lid}.{PLACEHOLDER_TAG}.wav" if placeholder else f"{lid}.wav")


def nv_path(nv):
    slug = re.sub(r"[^a-z0-9]+", "-", nv["kind"].lower()).strip("-")[:32]
    return NV_DIR / f"{nv['id']}_{slug}.{PLACEHOLDER_TAG}.wav"


def _job(task):
    kind, payload = task
    t0 = time.perf_counter()
    if kind == "line":
        l, V, cast, perf, shots, write = payload
        x, rec = render_line(_ENG, l, V, cast, perf)
        placeholder = perf[0] == "sung_placeholder"
        out = take_path(l["id"], placeholder)
        note = (f"{PLACEHOLDER_TAG} {l['id']}: sung line read in rhythm by TTS - not a performance. Replace with a "
                f"human recording.") if placeholder else None
        if write:
            sha = write_wav(out, x, note)
        else:
            with tempfile.TemporaryDirectory() as td:
                sha = write_wav(Path(td) / "t.wav", x, note)
        speech = x[int(rec["breath_s"] * SR):] if rec["breath_s"] else x
        harm, f0, vfrac = mv.harmonicity(speech, SR)
        return {"id": l["id"], "x_len": len(x), "rec": rec, "sha256": sha, "file": out, "placeholder": placeholder,
                "harm": harm, "f0": f0, "vfrac": vfrac, "centroid": mv.centroid(speech, SR),
                "voiced_rms": round(mv.db(mv.voiced_rms(speech)), 2), "peak": round(mv.db(np.max(np.abs(x))), 2),
                "phonemes": _ENG.phonemes(rec["tts_input"], cast["lang"]),
                "style_sha256": _ENG.style_sha256(cast), "engine": _ENG.info, "gen_s": round(time.perf_counter() - t0, 2)}
    nv, write = payload
    y, lim = render_nonverbal(_ENG, nv)
    out = nv_path(nv)
    note = f"{PLACEHOLDER_TAG} {nv['id']}: {nv['kind']} ({nv['who']}) - synthetic stand-in, not a performance. Replace with a human recording."
    if write:
        sha = write_wav(out, y, note)
    else:
        with tempfile.TemporaryDirectory() as td:
            sha = write_wav(Path(td) / "t.wav", y, note)
    return {"id": nv["id"], "x_len": len(y), "sha256": sha, "file": out, "limiter_max_gr_db": lim,
            "voiced_rms": round(mv.db(mv.voiced_rms(y)), 2), "peak": round(mv.db(np.max(np.abs(y))), 2),
            "engine": _ENG.info, "gen_s": round(time.perf_counter() - t0, 2)}


_CHK = None
_LINES = None
ASR_PARTITION = 48   # takes per recognizer instance (fixed, so the result never depends on --jobs or scheduling)


def _init_checker(lines):
    global _LINES
    _LINES = lines


def _asr_part(items):
    """One fresh recognizer per fixed partition, takes in episode order. pocketsphinx adapts its cepstral mean
    from one utterance to the next, so a shared, re-used decoder would make a borderline result depend on which
    takes it heard before (measured: 1 of 385 changed when the order was reversed)."""
    global _CHK
    _CHK = mv.Checker(_LINES)
    return [_asr_job(it) for it in items]


def _asr_job(item):
    """The recognizer hears the speech only: a synthetic breath before the line (pain, breathless) is a sound,
    not a word, and it decodes as a spurious 'if'. Word times are given from the start of the FILE."""
    lid, path, ref, breath_s = item
    x, _ = sf.read(str(path), dtype="float64")
    skip = int(round(breath_s * SR))
    asr, w, ok = _CHK.run(x[skip:], ref)
    for e in w:
        e["start_s"] = round(e["start_s"] + breath_s, 3); e["end_s"] = round(e["end_s"] + breath_s, 3)
    asr["aligned"] = ok
    asr["skipped_breath_s"] = breath_s
    asr["intelligible"] = asr["wer"] == 0 or asr["closed_set_match"]
    return lid, asr, {"aligned": ok, "words": w}


def _init_diag(threads, tmp, lines):
    _init_worker(threads, tmp)
    _init_checker(lines)


def _fresh_asr(x, ref):
    """Decode with a recognizer built for this one utterance (no history at all)."""
    r, _, _ = mv.Checker(_LINES).run(x, ref)
    return {"free_hyp": r["free_hyp"], "closed_set_pick": r["closed_set_pick"],
            "intelligible": r["wer"] == 0 or r["closed_set_match"]}


REF_VOICES = (("af_heart", "en-us"), ("am_michael", "en-us"))  # plain reference reads for the recognizer baseline


def _diag_job(item):
    """For a take the recognizer could not confirm, every decode below uses a recognizer built for that one
    utterance. (1) The take itself: if a fresh recognizer confirms it, the miss was the shared recognizer's
    adaptation. (2) The same words read plainly (no performance DSP, no pitch shift; same sentence split, edges and
    level as a take) by the role's OWN voice, and by two reference voices (af_heart, am_michael). (3) For a
    pitch-shifted role, the take shifted back. Verdicts: the own voice fails too -> the recognizer does not
    follow this voice on these words (not the processing); the shifted-back take passes -> the role pitch; the own
    voice passes but the take does not -> the performance processing made it harder: LISTEN; nothing passes ->
    a limit of the recognizer."""
    lid, path, text, ref, breath_s, role_pitch, cut, cast = item
    x, _ = sf.read(str(path), dtype="float64")
    x = x[int(round(breath_s * SR)):]
    out = {"take_fresh_recognizer": _fresh_asr(x, ref), "references": {}}
    own = ("own voice (" + cast["voice"] + ")", _ENG.style(cast), cast["lang"], cast["speed"])
    for name, v, lang, speed in [own] + [(v, v, lang, 1.0) for v, lang in REF_VOICES]:
        parts = []
        for i, snt in enumerate(mv.sentences(text)):
            a = _ENG.say(snt, v, speed, lang)
            a0, a1 = mv.speech_bounds(a, SR_TTS)
            parts += ([np.zeros(int(0.3 * SR_TTS))] if i else []) + [a[max(0, a0 - int(0.01 * SR_TTS)): a1 + int(0.01 * SR_TTS)]]
        a, _ = mv.sox(np.concatenate(parts), SR_TTS, "rate", "-v", str(SR))
        a, _ = mv.trim(a, SR, mv.EDGE_KEEP_S, mv.EDGE_KEEP_S)
        a, _ = mv.normalize(a)
        out["references"][name] = _fresh_asr(a, ref)
    if role_pitch:
        y, _ = mv.sox(x, SR, "pitch", str(int(round(-role_pitch * 100))))
        out["take_with_role_pitch_undone"] = _fresh_asr(y, ref)
    refs = list(out["references"].values())
    own_ok, other_ok = refs[0]["intelligible"], any(r["intelligible"] for r in refs[1:])
    if out["take_fresh_recognizer"]["intelligible"]:
        out["verdict"] = ("recognizer state: confirmed by a fresh recognizer; the shared one had adapted to the takes "
                          "heard before it")
    elif cut:
        out["verdict"] = "cut off by design: the last word is cut before it ends (the line is interrupted)"
    elif role_pitch and out["take_with_role_pitch_undone"]["intelligible"]:
        out["verdict"] = ("role pitch: confirmed once the role's pitch shift is undone; the recognizer's adult model "
                          "does not follow the shifted voice")
    elif not own_ok and other_ok:
        out["verdict"] = ("voice vs recognizer: the role's own voice read plainly is not confirmed either (another "
                          "voice is), so the processing is not the cause")
    elif not own_ok and not other_ok:
        out["verdict"] = "recognizer limit: no plain read of these words is confirmed, in any voice"
    else:
        out["verdict"] = "LISTEN: the role's own voice read plainly is confirmed, this take is not"
    return lid, out


# --------------------------------------------------------------------------------------------- records
def mix_hints(l, p, shots, nxt):
    sets = sorted({s["set"] for s in shots})
    airborne = bool(sets) and all(s in AIR_SETS for s in sets)
    if l["speaker"] == "NARRATOR":
        space, src = SPACES["NARRATION"]
    else:
        space = "; ".join(SPACES.get(s, (s, "?"))[0] for s in sets)
        src = "; ".join(sorted({SPACES.get(s, (s, "not mapped"))[1] for s in sets}))
    m = {"gain_db": p.get("mix_gain_db", 0.0), "space": space, "space_source": src,
         "wind_bed": "add the altitude wind bed in the mix (take is dry)" if airborne else None,
         "note": "Takes are dry and level-matched; reverb, wind and performance level are set in the mix."}
    if l["interrupted"] and nxt is not None:
        m["overlap"] = f"start {nxt['id']} ({nxt['speaker']}) 0-150 ms before this take's cut_at_s"
    if l.get("continues"):
        m["continues"] = f"picks up {l['continues']} (leading em dash not spoken)"
    if l["id"] == "L173":
        m["masking"] = "festival music partly covers it ('swallowed by the music'); the subtitle still shows it"
    if l["id"] == "L042":
        m["masking"] = "none: a close, clearly heard aside (voices.json special_lines.L042)"
    return airborne, m


def strong_words(text):
    return [m.group(0) for m in STRONG_RE.finditer(text)]


def build_record(l, cast, perf, shots, res, nxt):
    preset, p, speed, gap, why, rule = perf
    rec = res["rec"]
    airborne, mix = mix_hints(l, p, shots, nxt)
    voice = {"engine": "kokoro", "model": cast["model"], "voice": cast["voice"], "lang": cast["lang"],
             "license": cast["license"], "speed": speed, "role_speed": cast["speed"],
             "pitch_semitones": cast["pitch_semitones"] + p.get("pitch_st", 0.0),
             "role_pitch_semitones": cast["pitch_semitones"],
             "sentence_gap_s": gap if len(rec["segments"]) > 1 and preset != "sung_placeholder" else None}
    if cast["blend"]:
        voice["blend"] = [{"voice": v, "weight": w} for v, w in cast["parts"]]
        voice["blend_style_sha256"] = res["style_sha256"]
    placeholder = res["placeholder"]
    d = {
        "id": l["id"], "seq": l["seq"], "scene": l["scene"], "part": l.get("part"), "origin": l["origin"],
        "addition": l.get("addition"), "rating_pass": l.get("rating_pass"),
        "shots": [s["shot"] for s in shots], "speaker_on_screen": [s["on_screen"] for s in shots],
        "role": l["speaker"], "text": l["text"], "original": l["original"],
        "creator_approved": l.get("creator_approved"), "was_text_not_recorded": l.get("was_text"),
        "rating_content": l.get("rating_content") or [], "strong_language": strong_words(l["text"]),
        "tts_input": rec["tts_input"], "phonemes": res["phonemes"], "voice": voice,
        "performance": {"preset": preset, "rule": rule, "why": why, "delivery": l.get("delivery"),
                        "performance_note": l.get("performance_note"), "processing": rec["steps"]},
        "placeholder": placeholder,
        "needs_human_recording": placeholder,
        "airborne": airborne, "dry": True, "mix": mix,
        "file": Path(res["file"]).relative_to(FINAL).as_posix(),
        "format": "WAV PCM 24-bit, 48000 Hz, mono",
        "duration_s": round(res["x_len"] / SR, 4), "samples": int(res["x_len"]), "frames_24fps": round(res["x_len"] / 2000, 2),
        "speech_span_s": round(rec["segments"][-1]["end_s"] - rec["segments"][0]["start_s"], 3),
        "est_seconds_dialogue_json": l["est_seconds"],
        "segments": rec["segments"], "breath_s": rec["breath_s"], "cut_at_s": rec["cut_at_s"],
        "level": {"voiced_rms_dbfs": res["voiced_rms"], "peak_dbfs": res["peak"], "limiter_max_gr_db": rec["limiter_max_gr_db"]},
        "deess": rec["deess"],
        "metrics": {"harmonicity": res["harm"], "voiced_frame_share": res["vfrac"], "f0_median_hz": res["f0"],
                    "spectral_centroid_hz": res["centroid"]} | ({"whisper_check": rec["whisper_check"]} if rec["whisper_check"] else {}),
        "sha256": res["sha256"],
    }
    if placeholder:
        d["placeholder_label"] = {"kind": "sung line read in rhythm by TTS (TEMP)", "file_name": "contains .PLACEHOLDER.",
                                  "wav_info_comment": True, "tts_phrases": rec.get("tts_phrases"),
                                  "replace_with": "a human recording of the verse, sung low and badly-happily (newly written tune)"}
    return d


# --------------------------------------------------------------------------------------------- verify
def screenplay_cues():
    """Cues of the SHOOTING text of screenplay-final.md: WAS blocks (kept for the record, not shot) are removed."""
    fin = (FINAL / "screenplay-final.md").read_text(encoding="utf-8")
    fin = re.sub(r"^\[CHANGED (C\d+[a-z]?) — .* — WAS \(kept for the record, not shot\):\]\n.*?^\[CHANGED \1 — NOW \(shoot this\):\]$",
                 "", fin, flags=re.M | re.S)
    approved =re.findall(r"^([A-Z][A-Z' ]+) " + re.escape(APPROVED_TAG) + r":\n\"(.+)\"$", fin, flags=re.M)
    originals_final = re.findall(r"^([A-Z][A-Z ]+) \[ORIGINAL[^\]]*\]:\n\"(.+)\"$", fin, flags=re.M)
    return approved, originals_final


def verify(D, V, takes, nvs, words, run_asr=True, jobs=1):
    lines = D["lines"]
    by_id = {l["id"]: l for l in lines}
    problems, notes = [], []
    ids = [t["id"] for t in takes]
    if ids != [l["id"] for l in lines]:
        problems.append(f"takes.json ids do not match final/dialogue.json ({len(ids)} takes, {len(lines)} lines)")
    # --- text byte-exactness
    for t in takes:
        l = by_id[t["id"]]
        if t["text"].encode("utf-8") != l["text"].encode("utf-8"):
            problems.append(f"{t['id']}: text differs from final/dialogue.json")
        if words_of(t["tts_input"]) != words_of(l["text"].strip("—")):
            problems.append(f"{t['id']}: TTS input words differ from the text (words added or dropped)")
        if t["tts_input"] != l["text"].strip().strip("—").strip():
            problems.append(f"{t['id']}: TTS input is not the text itself (no respelling is defined in voices.json)")
        if SPECIES_RE.search(t["tts_input"]) or SPECIES_RE.search(t["text"]):
            problems.append(f"{t['id']}: names a scrapped dragon species")
        if t.get("was_text_not_recorded") and t["tts_input"] == t["was_text_not_recorded"].strip("—"):
            problems.append(f"{t['id']}: the OLD wording was recorded")
    # --- [ORIGINAL] lines: handoff cues + CANON LOCK item 8 + the shooting script's cues
    cues, canon = mv.screenplay_originals()  # the handoff (screenplay.md): 4 [ORIGINAL] cues + CANON LOCK item 8
    approved_cues, orig_final = screenplay_cues()
    expect = {"L011": [x for s, x in cues if s == "ALEXANDRIA"] + [x for s, x in orig_final if s == "ALEXANDRIA"],
              "L046": [x for s, x in cues if s == "REMI"][:1] + ([canon[0]] if canon else []) + [x for s, x in orig_final if s == "REMI"][:1],
              "L047": [x for s, x in cues if s == "REMI"][1:2] + ([canon[1]] if canon else []) + [x for s, x in orig_final if s == "REMI"][1:2]}
    orig_report = {}
    if len(orig_final) != 3:
        problems.append(f"screenplay-final.md: expected 3 [ORIGINAL] cues, found {len(orig_final)}")
    for lid, src in expect.items():
        t = next((t for t in takes if t["id"] == lid), None)
        if t is None:
            problems.append(f"{lid}: no take"); continue
        need = 2 if lid == "L011" else 3  # handoff cue + shooting-script cue (+ CANON LOCK item 8 for L046/L047)
        ok = len(src) == need and all(s == t["text"] for s in src) and by_id[lid]["original"]
        orig_report[lid] = {"text": t["text"], "sources_matched": len(src), "exact": ok, "tts_input_identical": t["tts_input"] == t["text"]}
        if not ok:
            problems.append(f"{lid}: [ORIGINAL] text is not byte-exact against screenplay.md + screenplay-final.md")
    # --- the five lines Daxtyn approved on 2026-10-18
    appr_ids = [l["id"] for l in lines if l.get("creator_approved")]
    appr_takes = [t for t in takes if t["creator_approved"]]
    appr_report = []
    if len(approved_cues) != 5 or len(appr_ids) != 5 or len(appr_takes) != 5:
        problems.append(f"approved lines: {len(approved_cues)} cues in screenplay-final.md, {len(appr_ids)} lines, "
                        f"{len(appr_takes)} takes (expected 5)")
    cue_of = dict(zip(appr_ids, approved_cues))  # both in script order
    for t in appr_takes:
        spk, txt = cue_of.get(t["id"], (None, None))
        ok = (spk == t["role"] and txt == t["text"] == t["tts_input"] and t["creator_approved"] == "2026-10-18"
              and t["was_text_not_recorded"] and t["was_text_not_recorded"] != t["text"])
        appr_report.append({"id": t["id"], "role": t["role"], "text": t["text"], "was_text_not_recorded": t["was_text_not_recorded"],
                            "exact": ok})
        if not ok:
            problems.append(f"{t['id']}: not spoken exactly in the approved wording")
    # L048 replaced Daxtyn's own [ORIGINAL] line: the old handoff cue must NOT be what is spoken
    old48 = [x for s, x in cues if s == "ABBY"]
    l048 = next((t for t in takes if t["id"] == "L048"), {"text": None})
    if not old48 or l048["text"] in (None, old48[0]) or not by_id["L048"].get("was_original"):
        problems.append("L048: expected the approved wording, not the old [ORIGINAL] wording")
    # --- files, format, level
    for t in takes + nvs:
        p = FINAL / t["file"]
        if not p.is_file():
            problems.append(f"{t['id']}: missing {t['file']}"); continue
        info = sf.info(str(p))
        if (info.samplerate, info.channels, info.subtype, info.format) != (SR, 1, "PCM_24", "WAV"):
            problems.append(f"{t['id']}: format {info.samplerate}/{info.channels}/{info.subtype}")
        if mv.sha256_file(p) != t["sha256"]:
            problems.append(f"{t['id']}: sha256 mismatch")
        x, _ = sf.read(str(p), dtype="float64")
        if abs(len(x) / SR - t["duration_s"]) > 1e-3:
            problems.append(f"{t['id']}: duration mismatch")
        pk = mv.db(np.max(np.abs(x)))
        speech = x[int(t.get("breath_s", 0) * SR):] if t.get("breath_s") else x
        vr = mv.db(mv.voiced_rms(speech))
        if pk > mv.PEAK_CEILING_DBFS + 0.01 or abs(vr - mv.TARGET_RMS_DBFS) > 0.3:
            problems.append(f"{t['id']}: level {vr:.2f} dBFS RMS / peak {pk:.2f} dBFS out of spec")
        is_ph = t.get("placeholder") or t["id"].startswith("NV-")
        if is_ph:
            with sf.SoundFile(str(p)) as f:
                c = f.comment or ""
            if PLACEHOLDER_TAG not in p.name or not c.startswith(PLACEHOLDER_TAG):
                problems.append(f"{t['id']}: placeholder is not labelled in its file name and WAV comment")
        elif PLACEHOLDER_TAG in p.name:
            problems.append(f"{t['id']}: a real take is named as a placeholder")
    # whispers
    for t in takes:
        if t["performance"]["preset"] == "whisper":
            wc = t["metrics"].get("whisper_check") or {}
            val = lambda v, missing: missing if v is None else v  # noqa: E731
            if not (val(t["metrics"]["harmonicity"], 1.0) < 0.35 and val(wc.get("voiced_frame_share_after"), 1.0) < 0.10
                    and val(wc.get("voiced_frame_share_before"), 0.0) > 0.4):
                problems.append(f"{t['id']}: whisper check failed (still voiced)")
    # --- casting
    roles_voice = {}
    for t in takes:
        roles_voice.setdefault(t["role"], set()).add(t["voice"]["voice"])
    shared = [r for r, v in roles_voice.items() if len(v) != 1]
    if shared:
        problems.append(f"role(s) with more than one voice: {shared}")
    vv = {}
    for r, v in roles_voice.items():
        vv.setdefault(next(iter(v)), []).append(r)
    if any(len(r) > 1 for r in vv.values()):
        problems.append(f"voice shared by two roles: {vv}")
    for t in takes:
        if t["voice"]["voice"] != V["roles"][t["role"]]["primary"]["voice"]:
            problems.append(f"{t['id']}: voice is not final/voices.json's primary for {t['role']}")
    creatures = {k for k in V.get("creature_vocals", {}) if k.isupper()}
    if any(t["role"] in creatures for t in takes):
        problems.append("a dragon speaks")
    i46 = next(i for i, l in enumerate(lines) if l["id"] == "L046")
    if lines[i46 + 1]["id"] != "L047" or lines[i46 + 1]["speaker"] != "REMI":
        problems.append("canon: the line after L046 must be Remi's L047 (Abby is silent)")
    # --- placeholders are listed for recording
    ph_ids = [t["id"] for t in takes if t["placeholder"]] + [n["id"] for n in nvs]
    sung = [l["id"] for l in lines if (l.get("performance_note") or "").startswith("sing")]
    if sorted(sung) != sorted(t["id"] for t in takes if t["placeholder"]):
        problems.append(f"sung lines {sung} must be exactly the placeholder takes")
    # --- the same take as the preview where nothing changed
    prev = {}
    pt = EP / "preview" / "vo" / "takes.json"
    preview_cmp = None
    if pt.is_file():
        prev = {t["id"]: t for t in json.loads(pt.read_text(encoding="utf-8"))["takes"]}
        same, changed_text, differ = [], [], []
        for t in takes:
            q = prev.get(t["id"])
            if not q:
                continue
            if q["text"] != t["text"]:
                changed_text.append(t["id"]); continue
            (same if q["sha256"] == t["sha256"] else differ).append(t["id"])
        preview_cmp = {"preview_takes": len(prev), "identical": len(same), "text_changed_since_preview": changed_text,
                       "different_audio_same_text": differ,
                       "meaning": "identical = byte-identical WAV made by the preview run (2026-10-07) and this run: "
                                  "the engine, the voices and the DSP are the same and deterministic"}
        if differ:
            problems.append(f"takes with the preview's text but different audio: {differ}")
    # --- intelligibility
    asr_summary = None
    if run_asr:
        items = [(t["id"], FINAL / t["file"], words_of(by_id[t["id"]]["text"]), t.get("breath_s") or 0.0) for t in takes]
        parts = [items[i:i + ASR_PARTITION] for i in range(0, len(items), ASR_PARTITION)]
        with ProcessPoolExecutor(max_workers=jobs, mp_context=_ctx(), initializer=_init_checker, initargs=(lines,)) as ex:
            results = [r for part in ex.map(_asr_part, parts) for r in part]
        tk = {t["id"]: t for t in takes}
        for lid, asr, w in results:
            tk[lid]["asr_check"] = asr
            words[lid] = w
        failing = [t for t in takes if not t["asr_check"]["intelligible"]]
        diag = {}
        if failing:
            ditems = [(t["id"], FINAL / t["file"], t["tts_input"], words_of(by_id[t["id"]]["text"]), t.get("breath_s") or 0.0,
                       t["voice"]["role_pitch_semitones"], bool(by_id[t["id"]]["interrupted"]), role_cast(V, t["role"]))
                      for t in failing]
            with ProcessPoolExecutor(max_workers=jobs, mp_context=_ctx(), initializer=_init_diag,
                                     initargs=(int(os.environ.get("DK_THREADS", "1")), os.environ.get("DK_TMP"), lines)) as ex:
                for lid, out in ex.map(_diag_job, ditems):
                    diag[lid] = out
        for t in failing:
            asr = t["asr_check"]
            asr["diagnosis"] = diag[t["id"]]
            notes.append(f"{t['id']} ({t['role']}, '{t['text']}'): pocketsphinx heard '{asr['free_hyp']}' (WER {asr['wer']:.2f}), "
                         f"picked '{asr['closed_set_pick']}'. {diag[t['id']]['verdict']}")
        wers = [t["asr_check"]["wer"] for t in takes]
        asr_summary = {
            "engine": "pocketsphinx 5.1.1 (bundled US-English model and CMU dictionary)",
            "purpose": "offline sanity check of the words only; it cannot judge acting or naturalness",
            "rule": "a take is 'intelligible' if free decoding gets every word (WER 0) or, decoding against a grammar "
                    "of all 385 lines, it picks its own line",
            "intelligible": sum(1 for t in takes if t["asr_check"]["intelligible"]), "of": len(takes),
            "free_decoding_wer_0": sum(1 for w in wers if w == 0),
            "closed_set_match": sum(1 for t in takes if t["asr_check"]["closed_set_match"]),
            "forced_alignment_ok": sum(1 for t in takes if t["asr_check"]["aligned"]),
            "mean_free_wer": round(float(np.mean(wers)), 3),
            "not_intelligible": [t["id"] for t in takes if not t["asr_check"]["intelligible"]],
            "not_intelligible_by_verdict": {
                k: [t["id"] for t in failing if t["asr_check"]["diagnosis"]["verdict"].startswith(k)]
                for k in ("recognizer state", "cut off by design", "role pitch", "voice vs recognizer", "recognizer limit",
                          "LISTEN")},
            "diagnosis_rule": _diag_job.__doc__.strip(),
            "why_free_wer_is_high_on_some_lines": [
                "1-3 word lines ('Attack.', 'Down!', 'Mostly.') give the language model no context.",
                "British voices (narrator, king, guard captain, musician, old woman...) against a US-English recognizer "
                "(measured in the preview: British voices WER 0.53-0.65 vs American 0.06-0.12 on the same line).",
                "Names and rare words (Verdor, Scrapper, gawping) are not in the recognizer's language model; "
                "whispered and processed lines (whisper, pain, shout) are harder for it by design."],
            "notes": notes}
    # --- strong language spoken as written: the word is in the TTS input unchanged (no bleep, no respelling),
    # in the phonemes, and the forced aligner finds it in the audio
    strong = []
    for t in takes:
        t["strong_language"] = strong_words(t["text"])  # from the text itself, never from an older record
        if not t["strong_language"]:
            continue
        al = {w["w"]: w for w in (words.get(t["id"]) or {}).get("words", [])}
        found = []
        for sw in t["strong_language"]:
            w = al.get(sw.lower().replace("’", "'"))
            found.append({"word": sw, "in_tts_input": re.search(rf"\b{re.escape(sw)}\b", t["tts_input"]) is not None,
                          "aligned_s": [w["start_s"], w["end_s"]] if w else None})
        need_align = run_asr or t["id"] in words
        ok = all(f["in_tts_input"] and (not need_align or (f["aligned_s"] and f["aligned_s"][1] - f["aligned_s"][0] >= 0.08))
                 for f in found)
        strong.append({"id": t["id"], "role": t["role"], "text": t["text"], "phonemes": t["phonemes"], "words": found,
                       "intelligible": (t.get("asr_check") or {}).get("intelligible"), "spoken_as_written": ok})
        if not ok:
            problems.append(f"{t['id']}: strong language not spoken as written (or not found by the aligner)")
    n_rated = sum(1 for l in lines if "strong language" in (l.get("rating_content") or []))
    if len(strong) != n_rated:
        problems.append(f"strong language: {len(strong)} takes carry it, dialogue.json marks {n_rated} lines")
    return problems, notes, {"originals": orig_report, "approved_wording": appr_report, "strong_language": strong,
                             "preview_comparison": preview_cmp, "asr": asr_summary, "placeholders": ph_ids}


def _ctx():
    import multiprocessing as mp
    return mp.get_context("spawn")


# --------------------------------------------------------------------------------------------- summaries
def voice_separation(takes, V):
    """Objective proxy for 'do two roles in the same scene sound alike?': median f0 of each role's takes and the
    distance between mean MFCC vectors (c1-c12, plain-preset takes only). Not a listening test."""
    def mfcc_mean(paths):
        acc = []
        for p in paths:
            x, _ = sf.read(str(p), dtype="float64")
            y = signal.resample_poly(x, 1, 3)  # 16 kHz
            f, tt, Z = signal.stft(y, fs=16000, nperseg=400, noverlap=240, nfft=512)
            P = np.abs(Z) ** 2
            e = P.sum(0)
            P = P[:, e > 0.05 * e.max()]
            if not P.shape[1]:
                continue
            mel = lambda h: 2595 * np.log10(1 + h / 700)  # noqa: E731
            edges = 700 * (10 ** (np.linspace(mel(80), mel(7600), 28) / 2595) - 1)
            fb = np.zeros((26, len(f)))
            for i in range(26):
                lo, c, hi = edges[i], edges[i + 1], edges[i + 2]
                fb[i] = np.clip(np.minimum((f - lo) / (c - lo), (hi - f) / (hi - c)), 0, None)
            lm = np.log(fb @ P + 1e-10)
            from scipy.fft import dct
            acc.append(dct(lm, axis=0, norm="ortho")[1:13].T)
        return np.concatenate(acc).mean(0) if acc else None

    roles = {}
    for t in takes:
        if t["placeholder"]:
            continue
        r = roles.setdefault(t["role"], {"f0": [], "paths": [], "scenes": set()})
        r["scenes"].add(t["scene"])
        if t["metrics"]["f0_median_hz"]:
            r["f0"].append(t["metrics"]["f0_median_hz"])
        if t["performance"]["preset"] in ("plain", "narration", "hurt", "firm") and len(r["paths"]) < 24:
            r["paths"].append(FINAL / t["file"])
    prof = {}
    for role, r in roles.items():
        prof[role] = {"f0_median_hz": round(float(np.median(r["f0"])), 1) if r["f0"] else None,
                      "mfcc": mfcc_mean(r["paths"] or [FINAL / t["file"] for t in takes if t["role"] == role][:8])}
    pairs = []
    names = sorted(roles)
    for i, a in enumerate(names):
        for b in names[i + 1:]:
            common = sorted(roles[a]["scenes"] & roles[b]["scenes"])
            if not common or prof[a]["mfcc"] is None or prof[b]["mfcc"] is None:
                continue
            fa, fb_ = prof[a]["f0_median_hz"], prof[b]["f0_median_hz"]
            st = round(abs(12 * np.log2(fa / fb_)), 2) if fa and fb_ else None
            dist = round(float(np.linalg.norm(prof[a]["mfcc"] - prof[b]["mfcc"])), 2)
            pairs.append({"roles": [a, b], "shared_scenes": common, "f0_difference_semitones": st, "mfcc_distance": dist})
    if pairs:
        dists = np.array([p["mfcc_distance"] for p in pairs])
        thr = float(np.percentile(dists, 15))
        for p in pairs:
            p["listen_first"] = bool((p["f0_difference_semitones"] is not None and p["f0_difference_semitones"] < 1.5)
                                     and p["mfcc_distance"] <= thr)
    blends = [r for r in V["roles"] if "blend" in V["roles"][r]["primary"]]
    return {"method": voice_separation.__doc__.strip(), "roles": {r: {"f0_median_hz": prof[r]["f0_median_hz"]} for r in names},
            "pairs_sharing_a_scene": sorted(pairs, key=lambda p: p["mfcc_distance"]),
            "listen_first": [p["roles"] for p in pairs if p.get("listen_first")],
            "blended_roles": blends}


def human_recording(takes, nvs, V):
    special = V["special_lines"]
    must = [{"id": t["id"], "role": t["role"], "text": t["text"], "why": "sung (Kokoro cannot sing)",
             "placeholder_file": t["file"]} for t in takes if t["placeholder"]]
    must += [{"id": n["id"], "role": n["who"], "kind": n["kind"], "scene": n["scene"], "shots": n["shots"],
              "why": "scream / cry (TTS cannot perform it)", "placeholder_file": n["file"]} for n in nvs]
    weak = [{"id": t["id"], "role": t["role"], "text": t["text"], "preset": t["performance"]["preset"],
             "honesty": special[t["id"]]["honesty"]} for t in takes if t["id"] in special and special[t["id"]].get("honesty")
            and not t["placeholder"]]
    for t in takes:  # whisper / pain lines without an 'honesty' note of their own
        if t["performance"]["preset"] in ("whisper", "pain") and t["id"] not in {w["id"] for w in weak}:
            weak.append({"id": t["id"], "role": t["role"], "text": t["text"], "preset": t["performance"]["preset"],
                         "honesty": "TTS cannot really whisper or sound hurt; this is DSP on a read line."})
    weak.sort(key=lambda w: next(t["seq"] for t in takes if t["id"] == w["id"]))
    pri = {}
    for r, v in V["roles"].items():
        pri.setdefault(v.get("human_recording_priority") or 9, []).append(r)
    return {"must_record": must, "group_or_library_recordings_no_placeholder": GROUP_VOICES,
            "strongly_recommended_lines": weak,
            "roles_by_priority": {str(k): pri[k] for k in sorted(pri)},
            "recommended_first": V["human_recordings"]["recommended_first"],
            "how": {k: V["human_recordings"][k] for k in ("path", "choice_file", "format", "consent")}}


def write_md(doc, path):
    T = doc["totals"]
    L = []
    w = L.append
    w("# Episode 1 voice takes (computer voices, provisional)")
    w("")
    w(f"Generated by `{doc['generated_by']}` from `final/dialogue.json` and `final/voices.json`. Do not edit by hand: "
      "re-run the script. Nothing here is approved by Daxtyn; a human recording replaces any take.")
    w("")
    w(f"- **{T['lines']} spoken lines, {T['takes']} takes** ({T['real_takes']} TTS performances + {T['sung_placeholders']} sung placeholder), "
      f"plus **{T['nonverbal_placeholders']} non-verbal placeholders** (screams / cries).")
    w(f"- **Total take length {T['vo_seconds']:.1f} s ({T['vo_seconds'] / 60:.2f} min)**; speech from first to last word in each take "
      f"{T['speech_span_seconds']:.1f} s ({T['speech_span_seconds'] / 60:.2f} min). dialogue.json estimated {T['est_seconds_dialogue_json']:.1f} s.")
    w(f"- {len(doc['roles'])} roles, one voice each, no voice shared. Format: 48 kHz mono 24-bit WAV, dry, voiced RMS -20 dBFS, peaks <= -3 dBFS.")
    c = doc["checks"]
    a = c.get("asr") or {}
    w(f"- Checks: problems {len(c['problems'])}; text byte-exact {c['text_byte_exact_vs_dialogue_json']}; "
      f"intelligible (pocketsphinx) {a.get('intelligible')}/{a.get('of')}; "
      f"preview takes reproduced byte for byte {((c.get('preview_comparison') or {}).get('identical'))}.")
    w("")
    w("## Must be recorded by a person (placeholders in the files now)")
    w("")
    w("| id | who | what | placeholder file |")
    w("|---|---|---|---|")
    for m in doc["human_recording"]["must_record"]:
        w(f"| {m['id']} | {m['role']} | {m.get('text') or m.get('kind')} | `{m['placeholder_file']}` |")
    w("")
    w("Also needed from people (groups or CC0 libraries; no placeholder made):")
    w("")
    for g in GROUP_VOICES:
        w(f"- {g['what']} ({g['where']}). {g['note']}")
    w("")
    w("## Strongly recommended for a real voice (the TTS take is weak)")
    w("")
    w("| id | role | text | treatment |")
    w("|---|---|---|---|")
    for m in doc["human_recording"]["strongly_recommended_lines"]:
        w(f"| {m['id']} | {m['role']} | {m['text']} | {m['preset']} |")
    w("")
    w(f"Roles to record first (voices.json): {', '.join(doc['human_recording']['recommended_first'])}.")
    w("")
    w("## Cast")
    w("")
    w("| role | voice | lang | speed | pitch | lines | seconds |")
    w("|---|---|---|---:|---:|---:|---:|")
    for r, v in doc["roles"].items():
        w(f"| {r} | `{v['voice']}`{' (blend)' if v['blend'] else ''} | {v['lang']} | {v['role_speed']} | {v['pitch_semitones']:+.1f} | {v['lines']} | {v['seconds']:.1f} |")
    w("")
    w("## Scenes")
    w("")
    w("| scene | lines | take seconds | dialogue.json estimate |")
    w("|---|---:|---:|---:|")
    for s, v in doc["scenes"].items():
        w(f"| {s} | {v['lines']} | {v['vo_seconds']:.1f} | {v['est_seconds_dialogue_json']:.1f} |")
    w("")
    w("## Performance treatments")
    w("")
    w("| preset | lines |")
    w("|---|---:|")
    for k, v in sorted(doc["presets_used"].items(), key=lambda kv: -kv[1]):
        w(f"| {k} | {v} |")
    w("")
    w("## Words that matter")
    w("")
    w("- [ORIGINAL] lines, byte-exact against the handoff and the shooting script: " +
      ", ".join(f"{k} {'ok' if v['exact'] else 'FAIL'}" for k, v in c["originals"].items()))
    w("- Wording Daxtyn approved on 2026-10-18 (old wording never recorded): " +
      ", ".join(f"{x['id']} {'ok' if x['exact'] else 'FAIL'}" for x in c["approved_wording"]))
    w("- Strong language spoken as written: " + ", ".join(
        f"{x['id']} ({', '.join(f['word'] for f in x['words'])}) {'ok' if x['spoken_as_written'] else 'CHECK'}" for x in c["strong_language"]))
    if a.get("not_intelligible"):
        w(f"- Not confirmed by the recognizer: {len(a['not_intelligible'])} of {a['of']} takes. Why, per take "
          "(a plain reference read of the same words by af_heart and am_michael tells a limit of the check from a weak take):")
        for k, v in (a.get("not_intelligible_by_verdict") or {}).items():
            if v:
                w(f"  - {k}: {', '.join(v)}")
    vs = doc.get("voice_separation") or {}
    if vs.get("listen_first"):
        w("- Role pairs in the same scene whose measured voices are closest (audition these first): " +
          "; ".join(" / ".join(p) for p in vs["listen_first"]))
    w("")
    path.write_text("\n".join(L) + "\n", encoding="utf-8")


# --------------------------------------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated line / placeholder ids to (re)render")
    ap.add_argument("--verify", action="store_true", help="verify the existing takes only")
    ap.add_argument("--repeat-check", help="'sample' or comma-separated ids: render again in memory, compare sha256")
    ap.add_argument("--no-asr", action="store_true", help="skip the pocketsphinx check")
    ap.add_argument("--jobs", type=int, default=int(os.environ.get("DK_JOBS", min(4, os.cpu_count() or 1))))
    args = ap.parse_args()

    D, V, S = load()
    lines = D["lines"]
    by_id = {l["id"]: l for l in lines}
    shots = shots_by_line(S)
    inj = injury_seq(D)
    threads = int(os.environ.get("DK_THREADS", "1"))
    tmp = os.environ.get("DK_TMP")
    tpath, wpath = VO / "takes.json", VO / "words.json"
    old = json.loads(tpath.read_text(encoding="utf-8")) if tpath.is_file() else None
    old_takes = {t["id"]: t for t in old["takes"]} if old else {}
    old_nv = {t["id"]: t for t in old.get("nonverbal_placeholders", [])} if old else {}
    words = json.loads(wpath.read_text(encoding="utf-8"))["lines"] if wpath.is_file() else {}
    casts = {r: role_cast(V, r) for r in V["roles"]}
    perfs = {l["id"]: line_perf(l, V, casts[l["speaker"]], inj) for l in lines}
    nxt = {l["id"]: (lines[i + 1] if i + 1 < len(lines) else None) for i, l in enumerate(lines)}

    if args.repeat_check:
        if args.repeat_check == "sample":
            pick, seen = [], set()
            for l in lines:  # one take per preset, one per blended or pitch-shifted role, cut-offs, placeholders
                c = casts[l["speaker"]]
                keys = {("preset", perfs[l["id"]][0])}
                if c["blend"] or c["pitch_semitones"]:
                    keys.add(("role", l["speaker"]))
                if l["interrupted"]:
                    keys.add(("cut", "any"))
                if STRONG_RE.search(l["text"]):
                    keys.add(("strong", "any"))
                if keys - seen:
                    seen |= keys; pick.append(l["id"])
            ids = list(dict.fromkeys(pick + [n["id"] for n in NONVERBAL]))
        else:
            ids = args.repeat_check.split(",")
        tasks = []
        for lid in ids:
            if lid in by_id:
                l = by_id[lid]
                tasks.append(("line", (l, V, casts[l["speaker"]], perfs[lid], shots.get(lid, []), False)))
            else:
                tasks.append(("nv", (next(n for n in NONVERBAL if n["id"] == lid), False)))
        bad = []
        with ProcessPoolExecutor(max_workers=args.jobs, mp_context=_ctx(), initializer=_init_worker, initargs=(threads, tmp)) as ex:
            for task, res in zip(tasks, ex.map(_job, tasks)):
                ref = (old_takes.get(res["id"]) or old_nv.get(res["id"]) or {}).get("sha256")
                same = ref == res["sha256"]
                print(f"{res['id']}: {'identical' if same else 'DIFFERENT'} ({res['sha256'][:16]})", flush=True)
                bad += [] if same else [res["id"]]
        rc_path = VO / "repeat-check.json"
        rc_path.write_text(json.dumps({"checked_at": time.strftime("%Y-%m-%d %H:%M:%S"), "ids": ids, "different": bad,
                                       "rule": "render again in fresh worker processes (spawn), write to a temp file, compare "
                                               "the sha256 with takes.json"}, indent=1) + "\n", encoding="utf-8")
        print(f"repeat-check: {len(ids) - len(bad)}/{len(ids)} identical")
        sys.exit(1 if bad else 0)

    VO.mkdir(parents=True, exist_ok=True)
    takes, nvs = dict(old_takes), dict(old_nv)
    eng_info = old["engine"] if old else None
    timing = old.get("timing") if old else None
    if not args.verify:
        only = set(args.only.split(",")) if args.only else None
        todo = [l for l in lines if not only or l["id"] in only]
        todo_nv = [n for n in NONVERBAL if not only or n["id"] in only]
        tasks = [("line", (l, V, casts[l["speaker"]], perfs[l["id"]], shots.get(l["id"], []), True)) for l in todo]
        tasks += [("nv", (n, True)) for n in todo_nv]
        # longest first, so the workers finish together
        tasks.sort(key=lambda t: -(len(t[1][0]["text"]) if t[0] == "line" else 30))
        t_all = time.perf_counter()
        gen_total = 0.0
        with ProcessPoolExecutor(max_workers=args.jobs, mp_context=_ctx(), initializer=_init_worker, initargs=(threads, tmp)) as ex:
            for task, res in zip(tasks, ex.map(_job, tasks)):
                eng_info = res["engine"]
                gen_total += res["gen_s"]
                if task[0] == "line":
                    l = task[1][0]
                    # a placeholder file name differs from a take's: drop the other one if the kind changed
                    for stale in (take_path(l["id"], not res["placeholder"]),):
                        if stale.is_file():
                            stale.unlink()
                    takes[l["id"]] = build_record(l, casts[l["speaker"]], perfs[l["id"]], shots.get(l["id"], []), res, nxt[l["id"]])
                    print(f"{l['id']:7} {l['speaker'][:14]:<14} {perfs[l['id']][0]:<16} {res['x_len'] / SR:5.2f}s gen {res['gen_s']:5.1f}s",
                          flush=True)
                else:
                    n = task[1][0]
                    nvs[n["id"]] = {"id": n["id"], "who": n["who"], "scene": n["scene"], "shots": n["shots"], "kind": n["kind"],
                                    "screenplay": n["screenplay"], "how_made": n["how_made"], "placeholder": True,
                                    "needs_human_recording": True,
                                    "file": Path(res["file"]).relative_to(FINAL).as_posix(), "format": "WAV PCM 24-bit, 48000 Hz, mono",
                                    "duration_s": round(res["x_len"] / SR, 4), "samples": int(res["x_len"]),
                                    "level": {"voiced_rms_dbfs": res["voiced_rms"], "peak_dbfs": res["peak"],
                                              "limiter_max_gr_db": res["limiter_max_gr_db"]},
                                    "mix": {"gain_db": n["mix_gain_db"], "note": "dry and level-matched like the takes; "
                                            "set the performance level in the mix"},
                                    "sha256": res["sha256"]}
                    print(f"{n['id']:9} placeholder {n['kind']:<34} {res['x_len'] / SR:5.2f}s", flush=True)
        wall = time.perf_counter() - t_all
        timing = {"rendered": len(tasks), "wall_s": round(wall, 1), "sum_of_worker_seconds": round(gen_total, 1),
                  "jobs": args.jobs, "onnx_threads_per_job": threads,
                  "machine": "cloud VM, 4 vCPU (Intel Xeon 2.1 GHz), no GPU" if (os.cpu_count() or 0) == 4 else f"{os.cpu_count()} CPUs"}
        print(f"rendered {len(tasks)} in {wall:.1f}s wall ({gen_total:.1f}s of worker time)", flush=True)
        # remove WAVs of ids that no longer exist
        known = {Path(t["file"]).name for t in takes.values()} | {Path(t["file"]).name for t in nvs.values()}
        for p in list(VO.glob("*.wav")) + list(NV_DIR.glob("*.wav")):
            if p.name not in known:
                p.unlink()

    take_list = [takes[l["id"]] for l in lines if l["id"] in takes]
    nv_list = [nvs[n["id"]] for n in NONVERBAL if n["id"] in nvs]
    problems, notes, extra = verify(D, V, take_list, nv_list, words, run_asr=not args.no_asr, jobs=args.jobs)
    for p in problems:
        print("PROBLEM:", p)
    for n in notes:
        print("note:", n)

    roles = {}
    for t in take_list:
        c = casts[t["role"]]
        r = roles.setdefault(t["role"], {"voice": t["voice"]["voice"], "blend": c["blend"], "lang": c["lang"],
                                         "role_speed": c["speed"], "pitch_semitones": c["pitch_semitones"],
                                         "license": c["license"], "casting": c["source"],
                                         "human_recording_priority": c["human_recording_priority"],
                                         "auditioned_before": V["roles"][t["role"]].get("audition_status") is None,
                                         "lines": 0, "seconds": 0.0})
        r["lines"] += 1; r["seconds"] = round(r["seconds"] + t["duration_s"], 2)
    scenes = {}
    for t in take_list:
        s = scenes.setdefault(t["scene"], {"lines": 0, "vo_seconds": 0.0, "speech_span_seconds": 0.0, "est_seconds_dialogue_json": 0.0})
        s["lines"] += 1
        s["vo_seconds"] = round(s["vo_seconds"] + t["duration_s"], 2)
        s["speech_span_seconds"] = round(s["speech_span_seconds"] + t["speech_span_s"], 2)
        s["est_seconds_dialogue_json"] = round(s["est_seconds_dialogue_json"] + t["est_seconds_dialogue_json"], 2)
    presets_used = {}
    for t in take_list:
        presets_used[t["performance"]["preset"]] = presets_used.get(t["performance"]["preset"], 0) + 1
    vs = voice_separation(take_list, V) if take_list and all((FINAL / t["file"]).is_file() for t in take_list) else None
    doc = {
        "schema": "dragons-kingdom/final-vo-takes v1",
        "episode": "S01E01",
        "status": ("PROVISIONAL computer-voice takes for every spoken line of the locked shooting script "
                   "(final/screenplay-final.md), for the animatic and the timed edit. Not approved by Daxtyn. Additions and "
                   "rating-pass lines are proposals until he accepts them; a human recording replaces any take "
                   "(voices.json human_recordings). PLACEHOLDER files are stand-ins, not performances."),
        "generated_by": REL(Path(__file__)),
        "script_sha256": mv.sha256_file(Path(__file__)),
        "dsp_module": {"path": REL(PREVIEW_TOOLS / "make_vo.py"), "sha256": mv.sha256_file(PREVIEW_TOOLS / "make_vo.py"),
                       "note": "the preview's engine, presets and DSP, imported unchanged"},
        "sources": {n: {"path": REL(p), "sha256": mv.sha256_file(p)} for n, p in (
            ("dialogue.json", FINAL / "dialogue.json"), ("voices.json", FINAL / "voices.json"),
            ("shotlist.json", FINAL / "shotlist.json"), ("screenplay-final.md", FINAL / "screenplay-final.md"),
            ("screenplay.md", EP / "screenplay.md"))},
        "decisions_applied": {
            "2026-10-18 decision 1": "the five species lines are spoken in Daxtyn's approved wording (L048, L053, L054, L109, "
                                     "X17-11); the old wording is never recorded",
            "2026-10-18 decision 2": "the Cling deaths are picture and sound design; no spoken line changes",
            "2026-10-18 decision 3": "Remi is an adult; his strong language (X8-01) is spoken as written",
            "2026-10-18 decision 4": "final pictures render on Daxtyn's PC; these takes are audio files made here. They are "
                                     "git-ignored, so copy final/vo/ to the PC (or regenerate there; see the README for why "
                                     "a non-Linux machine may not reproduce them byte for byte)"},
        "format": {"sample_rate": SR, "channels": 1, "subtype": "PCM_24", "container": "WAV",
                   "level": f"voiced RMS {mv.TARGET_RMS_DBFS:.0f} dBFS, sample peak <= {mv.PEAK_CEILING_DBFS:.0f} dBFS",
                   "edges": "40 ms lead and tail (20 ms tail on commands), 5 ms fades; cut-off lines end abruptly",
                   "dry": "no reverb, no wind, no music in any take; mix hints say where they go",
                   "frame": "24 fps at 48 kHz: one frame = 2000 samples",
                   "placeholder_label": "file name contains '.PLACEHOLDER.' and the WAV INFO comment starts with 'PLACEHOLDER'"},
        "engine": eng_info,
        "timing": timing,
        "determinism": {"seed_base": SEED_BASE, "seed_rule": "crc32('<id>:<purpose>') + seed_base",
                        "sox": "-R (repeatable) -D (no dither)", "onnx": "1 thread per worker process",
                        "check": "make_final_vo.py --repeat-check sample; and every take whose text is unchanged since "
                                 "the preview must equal the preview take byte for byte"},
        "roles": roles,
        "scenes": scenes,
        "presets_used": presets_used,
        "totals": {"lines": len(lines), "takes": len(take_list),
                   "real_takes": sum(1 for t in take_list if not t["placeholder"]),
                   "sung_placeholders": sum(1 for t in take_list if t["placeholder"]),
                   "nonverbal_placeholders": len(nv_list),
                   "vo_seconds": round(sum(t["duration_s"] for t in take_list), 2),
                   "speech_span_seconds": round(sum(t["speech_span_s"] for t in take_list), 2),
                   "est_seconds_dialogue_json": round(sum(t["est_seconds_dialogue_json"] for t in take_list), 2),
                   "nonverbal_seconds": round(sum(n["duration_s"] for n in nv_list), 2),
                   "by_origin": {o: {"lines": sum(1 for t in take_list if t["origin"] == o),
                                     "vo_seconds": round(sum(t["duration_s"] for t in take_list if t["origin"] == o), 2)}
                                 for o in ("original", "addition", "rating_pass")}},
        "checks": {
            "problems": problems,
            "text_byte_exact_vs_dialogue_json": not any("text differs" in p for p in problems),
            "originals": extra["originals"],
            "approved_wording": extra["approved_wording"],
            "strong_language": extra["strong_language"],
            "abby_silent_after_succession_question": not any(p.startswith("canon") for p in problems),
            "one_voice_per_role": not any("voice" in p and "role" in p for p in problems),
            "preview_comparison": extra["preview_comparison"],
            "asr": extra["asr"] if extra["asr"] else (old or {}).get("checks", {}).get("asr"),
            "placeholders_labelled": not any("labelled" in p for p in problems),
        },
        "voice_separation": vs,
        "human_recording": human_recording(take_list, nv_list, V),
        "takes": take_list,
        "nonverbal_placeholders": nv_list,
    }
    tpath.write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    if not args.no_asr:
        wpath.write_text(json.dumps({"schema": "dragons-kingdom/final-vo-words v1",
                                     "source": "pocketsphinx forced alignment of vo/<id>.wav against final/dialogue.json text; "
                                               "times in seconds from the start of the file, 10 ms resolution",
                                     "lines": {l["id"]: words[l["id"]] for l in lines if l["id"] in words}},
                                    indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    write_md(doc, VO / "takes.md")
    print(f"takes.json: {len(take_list)} takes + {len(nv_list)} placeholders, {doc['totals']['vo_seconds']} s of VO; "
          f"problems: {len(problems)}")
    sys.exit(1 if problems else 0)


if __name__ == "__main__":
    main()
