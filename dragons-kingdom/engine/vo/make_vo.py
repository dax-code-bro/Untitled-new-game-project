#!/usr/bin/env python3
"""engine/vo/make_vo.py - computer-voice takes for every spoken line of an episode (engine phase 6).

Generalises episodes/s01e01/final/tools/make_final_vo.py: the voice engine (Kokoro-82M, Apache-2.0), the performance
DSP (whisper, quiet, pain, raised ...), the level matching and the pocketsphinx check all come from
episodes/s01e01/preview/tools/make_vo.py (imported unchanged, as make_final_vo.py does). Episode 1 is not touched: its
takes stay make_final_vo.py's.

  <venv>/bin/python -I engine/vo/make_vo.py --episode t00 [--only L001,L002] [--engine kokoro|espeak] [--no-asr]
  (<venv> = episodes/s01e01/final/tools/preview-venv, git-ignored; make-episode.mjs finds it)

Voices (episodes/<ep>/final/voices.json, written when a speaking role has no voice yet; an existing role is never
recast - one voice per role, as final_voices.py): a role Episode 1 already cast keeps Episode 1's voice (series
continuity); a new role gets a free allowed Kokoro voice (not on the do-not-cast list, not used by another role of this
episode), female for a role whose name or pronoun says so, else male. Performance presets from the delivery note, the
same keyword table as final_voices.py (whispered, through pain, under his breath, calling ...).

If Kokoro (or its model files) is unavailable the takes are made with espeak-ng + SoX instead (marked engine
'espeak-ng', a FALLBACK: the pipeline still runs, the voices are robotic).

Writes episodes/<ep>/final/vo/<line>.wav (48 kHz mono 24-bit, git-ignored), vo/takes.json, vo/words.json (pocketsphinx
forced alignment), and voices.json. Incremental: a take whose text, voice, preset and engine are unchanged is kept.
"""
import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]                       # dragons-kingdom/
S1 = REPO / "episodes" / "s01e01"
sys.path.insert(0, str(S1 / "preview" / "tools"))

import numpy as np  # noqa: E402
import soundfile as sf  # noqa: E402

import make_vo as mv  # noqa: E402  (Episode 1 preview's engine + DSP, reused unchanged)

SR = mv.SR
KOKORO_EN = ["af_aoede", "af_bella", "af_heart", "af_jessica", "af_kore", "af_nicole", "af_river", "af_sarah", "af_sky",
             "am_adam", "am_eric", "am_fenrir", "am_liam", "am_michael", "am_puck", "bf_alice", "bf_emma", "bf_isabella",
             "bf_lily", "bm_daniel", "bm_george", "bm_lewis"]
PRESET_WORDS = [("whisper", "whisper"), ("singing", "plain"), ("through pain", "pain"), ("in pain", "pain"),
                ("under his breath", "quiet"), ("under her breath", "quiet"), ("quietly", "quiet"), ("low", "quiet"),
                ("to himself", "quiet"), ("to herself", "quiet"), ("shout", "shout"), ("calling", "raised"),
                ("calls", "raised"), ("louder", "raised"), ("urgent", "urgent"), ("firm", "firm")]
FEMALE = re.compile(r"\b(woman|women|girl|queen|mother|mum|lady|wife|daughter|sister|aunt|she|her|alexandria|abby)\b", re.I)
VERSION = 1


def rel(p):
    return Path(p).resolve().relative_to(REPO).as_posix()


def sha(s):
    return hashlib.sha1(s.encode()).hexdigest()[:16]


def load(p, d=None):
    try:
        return json.loads(Path(p).read_text(encoding="utf-8"))
    except FileNotFoundError:
        return d


def cast_voices(ep_final, lines):
    """voices.json for the episode: locked roles kept, Episode 1's voice for a series role, else a free voice."""
    S1V = load(S1 / "final" / "voices.json")
    path = ep_final / "voices.json"
    V = load(path) or {"schema": "dragons-kingdom voices v1 (engine)", "generated_by": "engine/vo/make_vo.py",
                       "rules": ["One voice per role for the whole episode; a cast role is never recast (edit this file to recast).",
                                 "A role Episode 1 cast keeps Episode 1's voice; new roles get a free allowed Kokoro voice.",
                                 "Kokoro-82M v1.0 voices only; never the do-not-cast list (engines.kokoro.caution)."],
                       "roles": {}}
    V["render_defaults"] = S1V["render_defaults"]
    V["pronunciation"] = S1V["pronunciation"]
    roles = []
    for l in lines:
        if l["speaker"] not in roles:
            roles.append(l["speaker"])
    used = {r["primary"]["voice"] for r in V["roles"].values()}
    changed = False
    for role in roles:
        if role in V["roles"]:
            continue
        if role in S1V["roles"]:
            V["roles"][role] = {"primary": S1V["roles"][role]["primary"], "source": "Episode 1 voices.json (series continuity)"}
        else:
            ctx = " ".join([role] + [l.get("delivery") or "" for l in lines if l["speaker"] == role])
            fem = bool(FEMALE.search(role)) or bool(re.search(r"\b(she|her)\b", ctx, re.I))
            s1_used = {r["primary"]["voice"] for k, r in S1V["roles"].items() if k in roles}
            pool = [v for v in KOKORO_EN if v[1] == ("f" if fem else "m") and v not in used and v not in mv.EXCLUDED_VOICES]
            pool = [v for v in pool if v not in s1_used] or pool or [v for v in KOKORO_EN if v[1] == ("f" if fem else "m")]
            v = pool[int(sha(role), 16) % len(pool)]
            V["roles"][role] = {"primary": {"engine": "kokoro", "voice": v, "speed": 1.0, "lang": "en-gb" if v.startswith("b") else "en-us",
                                            "pitch_semitones": 0.0},
                                "source": "engine/vo/make_vo.py: a free allowed voice (%s by role name / pronoun); audition before use" % ("female" if fem else "male")}
        used.add(V["roles"][role]["primary"]["voice"])
        changed = True
    if changed or not path.exists():
        path.write_text(json.dumps(V, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    return V


def perf_for(l, V, cast):
    note = (l.get("performance_note") or l.get("bracket_raw") or "").lower()
    preset, why = ("narration", "narrator") if l["speaker"] == "NARRATOR" else ("plain", "conversational")
    for k, p in PRESET_WORDS:
        if k in note:
            preset, why = p, f"delivery note '{k}'"
            break
    p = dict(mv.PRESETS[preset])
    speed = p["speed_abs"] if "speed_abs" in p else cast["speed"] * p.get("speed_mul", 1.0)
    gap = p.get("gap_s") if p.get("gap_s") is not None else cast["sentence_gap_s"]
    return preset, p, round(float(speed), 4), gap, why


def espeak_render(l, V, role):
    """FALLBACK: espeak-ng per sentence, SoX to 48 kHz, joined with the role's sentence gap, level-matched."""
    h = int(sha(role), 16)
    female = bool(FEMALE.search(role))
    voice = "en-us+%s%d" % ("f" if female else "m", 1 + h % (4 if female else 7))
    gap = V["render_defaults"]["sentence_gap_s"]["default"]
    parts, segs, pos = [], [], int(0.04 * SR)
    parts.append(np.zeros(pos))
    for i, s in enumerate(mv.sentences(mv.tts_text(l["text"], V))):
        with tempfile.TemporaryDirectory() as td:
            a, b = Path(td) / "a.wav", Path(td) / "b.wav"
            subprocess.run(["espeak-ng", "-v", voice, "-s", str(150 + h % 20), "-w", str(a), s], check=True, capture_output=True)
            subprocess.run(["sox", str(a), "-r", str(SR), "-c", "1", "-b", "24", str(b), "silence", "1", "0.01", "0.5%", "reverse",
                            "silence", "1", "0.01", "0.5%", "reverse"], check=True, capture_output=True)
            x, _ = sf.read(str(b), dtype="float64")
        if i:
            parts.append(np.zeros(int(gap * SR))); pos += len(parts[-1])
        segs.append({"text": s, "start_s": round(pos / SR, 3), "end_s": round((pos + len(x)) / SR, 3)})
        parts.append(x); pos += len(x)
    parts.append(np.zeros(int(0.04 * SR)))
    x = np.concatenate(parts)
    rms = mv.voiced_rms(x)
    if rms > 0:
        x = x * (10 ** (mv.TARGET_RMS_DBFS / 20) / rms)
    x = np.clip(x, -0.7, 0.7)
    return x, {"segments": segs, "tts_input": l["text"], "breath_s": 0.0, "steps": ["espeak-ng FALLBACK (%s)" % voice]}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--episode", required=True)
    ap.add_argument("--only")
    ap.add_argument("--engine", choices=["kokoro", "espeak"], default=os.environ.get("DK_VO_ENGINE", "kokoro"))
    ap.add_argument("--no-asr", action="store_true")
    a = ap.parse_args()
    if a.episode == "s01e01":
        sys.exit("s01e01's takes are made by episodes/s01e01/final/tools/make_final_vo.py")
    final = REPO / "episodes" / a.episode / "final"
    vo = final / "vo"
    vo.mkdir(parents=True, exist_ok=True)
    D = load(final / "dialogue.json")
    S = load(final / "shotlist.json", {"shots": []})
    lines = D["lines"]
    V = cast_voices(final, lines)
    shots = mv.shots_by_line(S)
    old = {t["id"]: t for t in (load(vo / "takes.json", {}) or {}).get("takes", [])}
    oldw = (load(vo / "words.json", {}) or {}).get("lines", {})
    eng, engine_name, why_fallback = None, "espeak-ng", None
    if a.engine == "kokoro":
        try:
            eng = mv.Engine(1)
            engine_name = "kokoro"
        except (Exception, SystemExit) as e:  # noqa: BLE001  (no onnxruntime / model files: fall back)
            why_fallback = str(e).splitlines()[0][:200]
            print(f"Kokoro unavailable ({why_fallback}): espeak-ng FALLBACK", file=sys.stderr)
    only = set(a.only.split(",")) if a.only else None
    chk = None
    takes, words, made = [], {}, 0
    for l in lines:
        role = l["speaker"]
        rv = V["roles"][role]["primary"]
        cast = {"engine": "kokoro", "voice": rv["voice"], "lang": rv["lang"], "speed": rv.get("speed", 1.0),
                "pitch_semitones": rv.get("pitch_semitones", 0.0),
                "sentence_gap_s": V["render_defaults"]["sentence_gap_s"].get(role, V["render_defaults"]["sentence_gap_s"]["default"])}
        perf = perf_for(l, V, cast)
        key = sha(json.dumps([VERSION, engine_name, l["text"], cast, perf[0], perf[2], perf[3]], sort_keys=True))
        out = vo / f"{l['id']}.wav"
        prev = old.get(l["id"])
        if prev and prev.get("key") == key and out.exists() and not (only and l["id"] in only):
            takes.append(prev)
            if l["id"] in oldw:
                words[l["id"]] = oldw[l["id"]]
            continue
        if only and l["id"] not in only and prev:
            takes.append(prev); continue
        if eng is not None:
            x, rec = mv.render(eng, l, V, cast, perf)
        else:
            x, rec = espeak_render(l, V, role)
        with sf.SoundFile(str(out), "w", SR, 1, subtype="PCM_24", format="WAV") as f:
            f.write(x)
        made += 1
        w, asr = [], None
        if not a.no_asr:
            try:
                if chk is None:
                    chk = mv.Checker(lines)
                skip = int(round(rec.get("breath_s", 0) * SR))
                asr, w, ok = chk.run(x[skip:], mv.words_of(l["text"]))
                for e in w:
                    e["start_s"] = round(e["start_s"] + rec.get("breath_s", 0), 3); e["end_s"] = round(e["end_s"] + rec.get("breath_s", 0), 3)
                words[l["id"]] = {"aligned": ok, "words": w}
            except Exception as e:  # noqa: BLE001
                asr = {"error": str(e)[:200]}
        segs = rec["segments"]
        takes.append({"id": l["id"], "seq": l.get("seq"), "scene": l["scene"], "shots": [s for s, _ in shots.get(l["id"], [])],
                      "role": role, "text": l["text"], "tts_input": rec.get("tts_input"), "file": f"vo/{l['id']}.wav",
                      "duration_s": round(len(x) / SR, 3), "segments": segs, "key": key,
                      "voice": {"engine": engine_name, **({k: cast[k] for k in ("voice", "lang", "speed", "pitch_semitones")} if eng else {})},
                      "performance": {"preset": perf[0], "why": perf[4]},
                      "mix": {"gain_db": perf[1].get("mix_gain_db", 0.0), "space": None},
                      "asr": asr, "sha256": mv.sha256_file(out)})
    doc = {"schema": "dragons-kingdom vo takes v1 (engine)", "episode": a.episode, "generated_by": "engine/vo/make_vo.py",
           "engine": engine_name, **({"fallback_reason": why_fallback} if why_fallback else {}),
           "dsp_module": rel(Path(mv.__file__)), "takes": takes}
    (vo / "takes.json").write_text(json.dumps(doc, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    (vo / "words.json").write_text(json.dumps({"schema": "word timings (pocketsphinx forced alignment)", "source": "engine/vo/make_vo.py",
                                               "lines": words}, indent=1) + "\n", encoding="utf-8")
    bad = [t["id"] for t in takes if t.get("asr") and not t["asr"].get("error") and t["asr"].get("wer", 0) > 0.5 and not t["asr"].get("closed_set_match")]
    print(f"vo {a.episode}: {len(takes)} takes ({made} made, {len(takes) - made} kept), engine {engine_name}"
          + (f"; ASR doubts: {', '.join(bad)}" if bad else ""))


if __name__ == "__main__":
    main()
