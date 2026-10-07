#!/usr/bin/env python3
"""make_srt.py - English subtitles for the S01E01 preview (PROLOGUE through 1E).

Reads (never modifies): ../../dialogue.json (text + subtitle_cues), ../edl.json (where each
take sits on the timeline, L003's split into parts), ../vo/words.json (forced-alignment word
times inside each take).
Writes: ../preview.en.srt (UTF-8) and ../mix/subtitles.json (the same cues with frames and
line ids, for check_mix.py).

Rules (dialogue.json subtitle_model, audio-plan.md section 9):
  * Text is exactly the line's subtitle_cues: only spoken words; never [ORIGINAL], bracketed
    notes or speaker names. Rows inside a cue keep dialogue.json's '\\n' break.
  * The place-name captions (TARA, SCRAPPER, ...) are part of the picture (edl.json
    onscreen_text), not subtitle events. The narrator's spoken words are subtitled.
  * A cue starts on the frame its first word starts (the EDL speech in-point for the first cue
    of a line; the aligned word time, mapped to the timeline, for a line's later cues).
  * A cue ends at the later of (its last word + 0.3 s) and (its start + its reading minimum:
    max(1.0, characters / 17) s, rounded up to 0.1 s), but at least 2 frames before the next
    cue starts. Interrupted lines therefore end where the interruption starts.
  * All times are whole frames at 24 fps.
"""
import json
import math
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
PREVIEW = HERE.parent
EP = PREVIEW.parent
FPS = 24
GAP_FRAMES = 2
READ_CPS = 17.0


def tokens(text):
    return [w for w in (re.sub(r"[^a-z0-9']", "", t.lower()) for t in re.split(r"[\s—\-]+", text)) if w]


def ts(frame):
    ms = int(round(frame * 1000 / FPS))
    h, r = divmod(ms, 3600000)
    m, r = divmod(r, 60000)
    s, ms = divmod(r, 1000)
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


def word_times(ln, words):
    """Timeline seconds of each aligned word of a line (L003: through its parts)."""
    out = []
    for w in words:
        if ln.get("parts"):
            samp = int(round(w["start_s"] * 48000))
            samp_end = int(round(w["end_s"] * 48000))
            part = next((p for p in ln["parts"] if p["take_in_sample"] <= samp < p["take_out_sample"]), ln["parts"][-1])
            base = part["timeline_frame"] / FPS - part["take_in_sample"] / 48000
            out.append((w["w"], base + samp / 48000, base + min(samp_end, part["take_out_sample"]) / 48000))
        else:
            base = ln["take_start_frame"] / FPS
            out.append((w["w"], base + w["start_s"], base + w["end_s"]))
    return out


def main():
    D = {l["id"]: l for l in json.loads((EP / "dialogue.json").read_text())["lines"]}
    edl = json.loads((PREVIEW / "edl.json").read_text())
    W = json.loads((PREVIEW / "vo" / "words.json").read_text())["lines"]
    lines = sorted(edl["lines"], key=lambda l: l["speech_in_frame"])
    problems = []
    cues = []
    for ln in lines:
        d = D[ln["id"]]
        if d["text"] != ln["text"]:
            problems.append(f"{ln['id']}: edl text differs from dialogue.json")
        sc = d["subtitle_cues"]
        joined = " ".join(c.replace("\n", " ") for c in sc)
        if re.sub(r"\s+", " ", joined).strip() != re.sub(r"\s+", " ", d["text"]).strip():
            problems.append(f"{ln['id']}: subtitle_cues do not join to the spoken text")
        if any(("[" in c or "]" in c or "ORIGINAL" in c) for c in sc):
            problems.append(f"{ln['id']}: bracket or [ORIGINAL] marker in subtitle text")
        wt = word_times(ln, W[ln["id"]]["words"]) if W.get(ln["id"], {}).get("aligned") else None
        k = 0
        for ci, text in enumerate(sc):
            toks = tokens(text)
            first = last = None
            if wt:
                seq = wt[k:k + len(toks)]
                if [w for w, _, _ in seq] == toks:
                    first, last = seq[0], seq[-1]
                else:
                    problems.append(f"{ln['id']} cue {ci + 1}: words.json does not match {toks} at {k}")
                k += len(toks)
            if ci == 0:
                f_in = ln["speech_in_frame"]
            else:
                f_in = int(round(first[1] * FPS)) if first else None
            word_end = last[2] if last else (ln["speech_out_s"] if ci == len(sc) - 1 else None)
            min_s = math.ceil(max(1.0, len(text.replace("\n", "")) / READ_CPS) * 10 - 1e-9) / 10
            cues.append({"line": ln["id"], "speaker": ln["speaker"], "cue": ci + 1, "of": len(sc), "text": text,
                         "in_frame": f_in, "word_end_s": word_end, "min_s": min_s,
                         "speech_out_frame": ln["speech_out_frame"]})
    # fill missing in-points (no alignment): share the line's span by characters
    for i, c in enumerate(cues):
        if c["in_frame"] is None:
            problems.append(f"{c['line']} cue {c['cue']}: no word timing")
    cues.sort(key=lambda c: c["in_frame"])
    for i, c in enumerate(cues):
        nxt = cues[i + 1]["in_frame"] if i + 1 < len(cues) else None
        want = max(int(math.ceil(((c["word_end_s"] or c["in_frame"] / FPS) + 0.3) * FPS)),
                   c["in_frame"] + int(math.ceil(c["min_s"] * FPS - 1e-9)))
        out = want if nxt is None else min(want, nxt - GAP_FRAMES)
        c["out_frame"] = out
        c["held_s"] = round((out - c["in_frame"]) / FPS, 3)
        c["short_of_min"] = (out - c["in_frame"]) / FPS < c["min_s"] - 1e-9
        c["clipped_by_next"] = nxt is not None and want > nxt - GAP_FRAMES
        if out <= c["in_frame"]:
            problems.append(f"{c['line']} cue {c['cue']}: no room before the next cue")
    srt = []
    for i, c in enumerate(cues, 1):
        srt.append(f"{i}\n{ts(c['in_frame'])} --> {ts(c['out_frame'])}\n{c['text']}\n")
    (PREVIEW / "preview.en.srt").write_text("\n".join(srt), encoding="utf-8")
    (PREVIEW / "mix").mkdir(exist_ok=True)
    doc = {"schema": "dragons-kingdom/preview-subtitles v1", "generated_by": "dragons-kingdom/episodes/s01e01/preview/tools/make_srt.py",
           "file": "preview.en.srt", "fps": FPS, "gap_frames": GAP_FRAMES, "reading_cps": READ_CPS,
           "count": len(cues), "lines": len(lines), "problems": problems, "cues": cues}
    (PREVIEW / "mix" / "subtitles.json").write_text(json.dumps(doc, indent=1) + "\n")
    short = [f"{c['line']}#{c['cue']} {c['held_s']}s<{c['min_s']}s" for c in cues if c["short_of_min"]]
    print(f"preview.en.srt: {len(cues)} cues for {len(lines)} lines; {len(short)} held shorter than their reading "
          f"minimum because the next line starts sooner: {', '.join(short) if short else 'none'}")
    if problems:
        print("PROBLEMS:\n  " + "\n  ".join(problems))
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
